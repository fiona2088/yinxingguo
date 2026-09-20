"""
Masked ODE 模型推理脚本
功能:
1. 加载训练好的模型
2. 进行温度预测
3. 异常检测
4. 可视化结果
5. 批量预测
6. 单步预测
"""

import warnings
warnings.filterwarnings('ignore')

import pandas as pd
import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np
import matplotlib.pyplot as plt
from sklearn.preprocessing import MinMaxScaler, LabelEncoder
from sklearn.metrics import r2_score, mean_squared_error, mean_absolute_error
import os
from typing import Dict, Tuple, Optional, List
from dataclasses import dataclass
import joblib
from datetime import datetime

# 设备
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
print(f'使用设备: {device}')


@dataclass
class ModelConfig:
    """模型配置"""
    nx: int = 3
    nu_base: int = 10
    n_zones: int = 3
    hidden_dim: int = 128
    n_building_types: int = 8
    h: float = 3600.0
    seq_len: int = 24


# ==================== 模型组件 ====================

class DynamicPhysicsCoefficients(nn.Module):
    def __init__(self, hidden_size: int = 64):
        super().__init__()
        self.mode_classifier = nn.Sequential(
            nn.Linear(4, hidden_size), nn.ReLU(),
            nn.Linear(hidden_size, 3), nn.Softmax(dim=-1)
        )
        self.R_generator = nn.ModuleList([
            nn.Sequential(nn.Linear(4, hidden_size), nn.ReLU(), nn.Linear(hidden_size, 3))
            for _ in range(3)
        ])
        self.C_generator = nn.ModuleList([
            nn.Sequential(nn.Linear(4, hidden_size), nn.ReLU(), nn.Linear(hidden_size, 3))
            for _ in range(3)
        ])
        self.COP_generator = nn.ModuleList([
            nn.Sequential(nn.Linear(4, hidden_size), nn.ReLU(), nn.Linear(hidden_size, 1))
            for _ in range(3)
        ])
        self.R_base = nn.Parameter(torch.ones(3) * 0.5)
        self.C_base = nn.Parameter(torch.ones(3) * 500.0)
        self.COP_base = nn.Parameter(torch.tensor([2.5, 3.0, 2.8]))

    def forward(self, conditions):
        mode_probs = self.mode_classifier(conditions)
        R_list = [self.R_generator[i](conditions) for i in range(3)]
        C_list = [self.C_generator[i](conditions) for i in range(3)]
        COP_list = [self.COP_generator[i](conditions) for i in range(3)]
        R = sum(mode_probs[:, i:i+1] * R_list[i] for i in range(3))
        C = sum(mode_probs[:, i:i+1] * C_list[i] for i in range(3))
        COP = sum(mode_probs[:, i:i+1] * COP_list[i] for i in range(3))
        R = F.softplus(R) + self.R_base.unsqueeze(0)
        C = F.softplus(C) + self.C_base.unsqueeze(0)
        COP = F.softplus(COP) + self.COP_base[1].unsqueeze(0).unsqueeze(0)
        return R, C, COP


class InterZoneThermalResistance(nn.Module):
    def __init__(self, hidden_size: int = 32):
        super().__init__()
        self.R_inter_net = nn.Sequential(
            nn.Linear(4, hidden_size), nn.ReLU(),
            nn.Linear(hidden_size, 3), nn.Softplus()
        )
        self.R_inter_base = nn.Parameter(torch.tensor([2.0, 3.0, 2.5]))

    def forward(self, conditions):
        R_dynamic = self.R_inter_net(conditions)
        return R_dynamic + self.R_inter_base.unsqueeze(0)


class MaskMatrix(nn.Module):
    def __init__(self, n_zones: int = 3, hidden_size: int = 32):
        super().__init__()
        self.n_zones = n_zones
        self.mask_net = nn.Sequential(
            nn.Linear(3, hidden_size), nn.ReLU(),
            nn.Linear(hidden_size, n_zones * n_zones), nn.Sigmoid()
        )
        self.mask_base = nn.Parameter(torch.eye(n_zones) * 0.8 + 0.1)

    def forward(self, conditions):
        batch_size = conditions.shape[0]
        mask_dynamic = self.mask_net(conditions).view(batch_size, self.n_zones, self.n_zones)
        mask = mask_dynamic + self.mask_base.unsqueeze(0)
        mask = torch.clamp(mask, 0, 1)
        return (mask + mask.transpose(1, 2)) / 2


class MaskedODEFunction(nn.Module):
    def __init__(self, config: ModelConfig):
        super().__init__()
        self.config = config
        self.n_zones = config.n_zones
        self.physics_coeffs = DynamicPhysicsCoefficients()
        self.inter_zone_R = InterZoneThermalResistance()
        self.mask_matrix = MaskMatrix(n_zones=config.n_zones)
        self.net = nn.Sequential(
            nn.Linear(config.nu_base + config.n_building_types + config.n_zones, config.hidden_dim),
            nn.ReLU(),
            nn.Linear(config.hidden_dim, config.hidden_dim),
            nn.ReLU(),
            nn.Linear(config.hidden_dim, config.n_zones)
        )

    def physics_layer(self, T_zones, Text, GHI, E_zones, conditions):
        batch_size = T_zones.shape[0]
        R, C, COP = self.physics_coeffs(conditions)
        wind = torch.ones_like(Text) * 2.0
        T_diff = torch.abs(Text - T_zones.mean(dim=1, keepdim=True))
        inter_conditions = torch.cat([Text, GHI, wind, T_diff], dim=-1)
        R_inter = self.inter_zone_R(inter_conditions)
        occupancy = (E_zones.sum(dim=1, keepdim=True) > 0).float()
        mask_conditions = torch.cat([Text, conditions[:, 2:3], occupancy], dim=-1)
        mask = self.mask_matrix(mask_conditions)
        
        R_safe = R + 1e-6
        Q_ext = (Text - T_zones) / R_safe
        
        solar_gain = torch.zeros_like(T_zones)
        solar_gain[:, 2] = GHI.squeeze(-1) * 0.001
        solar_gain[:, 1] = GHI.squeeze(-1) * 0.0003
        
        T_diff_matrix = T_zones.unsqueeze(2) - T_zones.unsqueeze(1)
        R_inter_matrix = torch.zeros(batch_size, 3, 3, device=T_zones.device)
        R_inter_matrix[:, 0, 1] = R_inter[:, 0]
        R_inter_matrix[:, 1, 0] = R_inter[:, 0]
        R_inter_matrix[:, 0, 2] = R_inter[:, 1]
        R_inter_matrix[:, 2, 0] = R_inter[:, 1]
        R_inter_matrix[:, 1, 2] = R_inter[:, 2]
        R_inter_matrix[:, 2, 1] = R_inter[:, 2]
        R_inter_matrix = R_inter_matrix + 1e-6
        
        Q_inter = (mask * T_diff_matrix / R_inter_matrix).sum(dim=2)
        
        C_safe = C + 1e-6
        Q_hvac = E_zones * COP / C_safe
        
        dTdt_physics = (Q_ext + Q_inter + Q_hvac + solar_gain) / 3600.0
        return dTdt_physics, mask

    def forward(self, t, state, u):
        Text = u[:, 0:1]
        GHI = u[:, 1:2]
        E_zones = u[:, 2:5]
        T_avg = state.mean(dim=1, keepdim=True)
        conditions = torch.cat([Text, GHI, u[:, 8:9], T_avg], dim=-1)
        dTdt_physics, mask = self.physics_layer(state, Text, GHI, E_zones, conditions)
        nn_input = torch.cat([u, state], dim=-1)
        dTdt_nn = self.net(nn_input) * 0.1
        return dTdt_physics + dTdt_nn


class CompleteResidentialNODE(nn.Module):
    def __init__(self, config: ModelConfig):
        super().__init__()
        self.config = config
        self.n_zones = config.n_zones
        self.nu_total = config.nu_base + config.n_building_types
        self.ode_func = MaskedODEFunction(config)

    def rk4_step(self, state, u, dt=3600.0):
        t = torch.tensor(0.0, device=state.device)
        k1 = self.ode_func(t, state, u)
        k2 = self.ode_func(t, state + dt/2 * k1, u)
        k3 = self.ode_func(t, state + dt/2 * k2, u)
        k4 = self.ode_func(t, state + dt * k3, u)
        return state + dt/6 * (k1 + 2*k2 + 2*k3 + k4)

    def forward(self, T_init, U):
        batch_size, seq_len, _ = U.shape
        T_list = []
        T_current = T_init
        for t in range(seq_len):
            u_t = U[:, t, :]
            T_current = self.rk4_step(T_current, u_t, dt=self.config.h)
            T_list.append(T_current.unsqueeze(1))
        return torch.cat(T_list, dim=1)


# ==================== 推理器 ====================

class MaskedODEPredictor:
    """Masked ODE 预测器 - 完整的推理功能"""
    
    def __init__(self, model_path: str = 'models/masked_ode_best.pth', 
                 scaler_path: str = 'models/'):
        self.config = ModelConfig()
        self.model = CompleteResidentialNODE(self.config).to(device)
        self.model.eval()
        
        # 加载模型
        self._load_model(model_path)
        
        # 加载scaler
        self.u_scaler = self._load_scaler(os.path.join(scaler_path, 'u_scaler.pkl'))
        self.x_scaler = self._load_scaler(os.path.join(scaler_path, 'x_scaler.pkl'))
        
        # 加载建筑类型编码器
        self.building_encoder = self._load_encoder(os.path.join(scaler_path, 'building_encoder.pkl'))
        
        # 加载孤立森林
        self.isolation_forest = self._load_isolation_forest(os.path.join(scaler_path, 'isolation_forest_model.pkl'))
        
        print(f"\n预测器初始化完成!")
        print(f"模型路径: {model_path}")
        print(f"设备: {device}")
    
    def _load_model(self, model_path: str):
        """加载模型权重"""
        if os.path.exists(model_path):
            checkpoint = torch.load(model_path, map_location=device)
            if isinstance(checkpoint, dict) and 'model_state_dict' in checkpoint:
                self.model.load_state_dict(checkpoint['model_state_dict'])
                print(f"模型已加载: {model_path}")
                if 'r2' in checkpoint:
                    print(f"  训练R²: {checkpoint['r2']:.4f}")
                if 'epoch' in checkpoint:
                    print(f"  训练轮数: {checkpoint['epoch']}")
            else:
                self.model.load_state_dict(checkpoint)
                print(f"模型权重已加载: {model_path}")
        else:
            print(f"警告: 模型文件不存在 {model_path}")
    
    def _load_scaler(self, scaler_path: str):
        """加载scaler"""
        if os.path.exists(scaler_path):
            return joblib.load(scaler_path)
        else:
            print(f"警告: Scaler文件不存在 {scaler_path}")
            return MinMaxScaler()
    
    def _load_encoder(self, encoder_path: str):
        """加载建筑类型编码器"""
        if os.path.exists(encoder_path):
            return joblib.load(encoder_path)
        else:
            print(f"警告: 编码器文件不存在 {encoder_path}")
            return None
    
    def _load_isolation_forest(self, forest_path: str):
        """加载孤立森林"""
        if os.path.exists(forest_path):
            print("孤立森林模型已加载")
            return joblib.load(forest_path)
        else:
            print("警告: 孤立森林模型未找到")
            return None
    
    def predict(self, T_init: np.ndarray, U: np.ndarray) -> np.ndarray:
        """
        预测温度
        Args:
            T_init: [batch, 3] 初始温度 (Core, Perimeter, Roof)
            U: [batch, seq_len, nu] 输入序列
        Returns:
            T_pred: [batch, seq_len, 3] 预测温度
        """
        with torch.no_grad():
            T_init_tensor = torch.tensor(T_init, dtype=torch.float32).to(device)
            U_tensor = torch.tensor(U, dtype=torch.float32).to(device)
            T_pred = self.model(T_init_tensor, U_tensor)
        return T_pred.cpu().numpy()
    
    def predict_single_step(self, T_current: np.ndarray, U_current: np.ndarray) -> np.ndarray:
        """
        单步预测 - 预测下一个时间步的温度
        Args:
            T_current: [batch, 3] 当前温度
            U_current: [batch, nu] 当前输入
        Returns:
            T_next: [batch, 3] 下一时刻温度
        """
        with torch.no_grad():
            T_current_tensor = torch.tensor(T_current, dtype=torch.float32).to(device)
            U_current_tensor = torch.tensor(U_current, dtype=torch.float32).to(device)
            U_seq = U_current_tensor.unsqueeze(1)  # [batch, 1, nu]
            T_pred = self.model(T_current_tensor, U_seq)
        return T_pred[:, 0, :].cpu().numpy()
    
    def predict_with_metrics(self, T_init: np.ndarray, U: np.ndarray, 
                            T_true: np.ndarray) -> Dict:
        """
        带评估指标的预测
        """
        T_pred = self.predict(T_init, U)
        
        # 反归一化
        if hasattr(self.x_scaler, 'inverse_transform'):
            T_true_denorm = self.x_scaler.inverse_transform(
                T_true.reshape(-1, 3)).reshape(T_true.shape)
            T_pred_denorm = self.x_scaler.inverse_transform(
                T_pred.reshape(-1, 3)).reshape(T_pred.shape)
        else:
            T_true_denorm = T_true
            T_pred_denorm = T_pred
        
        # 计算指标
        zone_names = ['Core', 'Perimeter', 'Roof']
        metrics = {}
        
        for i, name in enumerate(zone_names):
            r2_zone = r2_score(T_true_denorm[:, :, i].flatten(), 
                              T_pred_denorm[:, :, i].flatten())
            mse_zone = mean_squared_error(T_true_denorm[:, :, i].flatten(), 
                                         T_pred_denorm[:, :, i].flatten())
            mae_zone = mean_absolute_error(T_true_denorm[:, :, i].flatten(), 
                                          T_pred_denorm[:, :, i].flatten())
            metrics[name] = {
                'R2': r2_zone,
                'MSE': mse_zone,
                'MAE': mae_zone
            }
        
        # 整体指标
        metrics['Overall'] = {
            'R2': r2_score(T_true_denorm.flatten(), T_pred_denorm.flatten()),
            'MSE': mean_squared_error(T_true_denorm.flatten(), T_pred_denorm.flatten()),
            'MAE': mean_absolute_error(T_true_denorm.flatten(), T_pred_denorm.flatten())
        }
        
        return {
            'prediction': T_pred_denorm,
            'ground_truth': T_true_denorm,
            'metrics': metrics
        }
    
    def detect_anomaly(self, features: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
        """
        异常检测
        """
        if self.isolation_forest is None:
            print("警告: 孤立森林模型未加载")
            return np.ones(len(features)), np.zeros(len(features))
        
        labels = self.isolation_forest.predict(features)
        scores = self.isolation_forest.decision_function(features)
        return labels, scores
    
    def prepare_input(self, df_row: pd.Series, building_type: str = 'Office_Small') -> np.ndarray:
        """
        准备单条输入数据
        """
        # 时间特征
        hour_norm = df_row['hour'] / 24.0 if 'hour' in df_row else 0.5
        month_norm = (df_row['month'] - 1) / 11.0 if 'month' in df_row else 0.5
        
        # 基础特征
        u_base = np.array([
            df_row.get('Text', 20.0),
            df_row.get('GHI', 0.0),
            df_row.get('E_core', 0.0),
            df_row.get('E_peri', 0.0),
            df_row.get('E_roof', 0.0),
            df_row.get('T_core', 22.0),
            df_row.get('T_peri', 22.0),
            df_row.get('T_roof', 22.0),
            hour_norm,
            month_norm
        ]).reshape(1, -1)
        
        # 建筑类型one-hot
        if self.building_encoder is not None:
            try:
                building_idx = self.building_encoder.transform([building_type])[0]
                building_onehot = np.eye(len(self.building_encoder.classes_))[building_idx]
            except:
                building_onehot = np.zeros(len(self.building_encoder.classes_))
                building_onehot[0] = 1
        else:
            building_onehot = np.zeros(self.config.n_building_types)
            building_onehot[0] = 1
        
        u_array = np.concatenate([u_base, building_onehot.reshape(1, -1)], axis=1)
        
        # 归一化
        if hasattr(self.u_scaler, 'transform'):
            u_scaled = self.u_scaler.transform(u_array)
        else:
            u_scaled = u_array
        
        return u_scaled


# ==================== 可视化 ====================

def visualize_prediction(result: Dict, save_path: str = 'visualizations/inference_result.png'):
    """可视化预测结果"""
    T_pred = result['prediction']
    T_true = result['ground_truth']
    metrics = result['metrics']
    
    fig, axes = plt.subplots(2, 2, figsize=(14, 10))
    
    zones = ['Core', 'Perimeter', 'Roof']
    colors = ['blue', 'green', 'red']
    
    # 1. 各区域温度预测对比
    ax = axes[0, 0]
    sample_idx = 0
    time_steps = np.arange(T_true.shape[1])
    for i, (name, color) in enumerate(zip(zones, colors)):
        ax.plot(time_steps, T_true[sample_idx, :, i], color=color, linestyle='-', 
                label=f'{name} (True)', alpha=0.8, linewidth=2)
        ax.plot(time_steps, T_pred[sample_idx, :, i], color=color, linestyle='--', 
                label=f'{name} (Pred)', alpha=0.8, linewidth=2)
    ax.set_xlabel('Time Step')
    ax.set_ylabel('Temperature (°C)')
    ax.set_title(f'Sample Prediction (R²={metrics["Overall"]["R2"]:.4f})')
    ax.legend(fontsize=8)
    ax.grid(True, alpha=0.3)
    
    # 2. 预测误差
    ax = axes[0, 1]
    errors = np.abs(T_pred[sample_idx] - T_true[sample_idx])
    for i, (name, color) in enumerate(zip(zones, colors)):
        ax.plot(time_steps, errors[:, i], color=color, label=f'{name} Error', alpha=0.8)
    ax.set_xlabel('Time Step')
    ax.set_ylabel('Absolute Error (°C)')
    ax.set_title('Prediction Error')
    ax.legend()
    ax.grid(True, alpha=0.3)
    
    # 3. 散点图
    ax = axes[1, 0]
    ax.scatter(T_true.flatten(), T_pred.flatten(), alpha=0.3, s=1)
    min_val = min(T_true.min(), T_pred.min())
    max_val = max(T_true.max(), T_pred.max())
    ax.plot([min_val, max_val], [min_val, max_val], 'r--', lw=2)
    ax.set_xlabel('True Temperature (°C)')
    ax.set_ylabel('Predicted Temperature (°C)')
    ax.set_title(f'True vs Pred (R²={metrics["Overall"]["R2"]:.4f})')
    ax.grid(True, alpha=0.3)
    
    # 4. 指标表格
    ax = axes[1, 1]
    ax.axis('off')
    
    table_data = []
    for zone in ['Core', 'Perimeter', 'Roof', 'Overall']:
        table_data.append([
            zone,
            f"{metrics[zone]['R2']:.4f}",
            f"{metrics[zone]['MSE']:.4f}",
            f"{metrics[zone]['MAE']:.4f}"
        ])
    
    table = ax.table(cellText=table_data,
                    colLabels=['Zone', 'R²', 'MSE', 'MAE'],
                    cellLoc='center',
                    loc='center',
                    bbox=[0, 0.3, 1, 0.6])
    table.auto_set_font_size(False)
    table.set_fontsize(10)
    table.scale(1, 2)
    ax.set_title('Metrics Summary', fontsize=12, fontweight='bold')
    
    plt.tight_layout()
    os.makedirs(os.path.dirname(save_path), exist_ok=True)
    plt.savefig(save_path, dpi=150, bbox_inches='tight')
    print(f"可视化已保存: {save_path}")
    plt.close()


def print_metrics(metrics: Dict):
    """打印评估指标"""
    print("\n" + "="*60)
    print("预测结果评估")
    print("="*60)
    print(f"{'Zone':<15} {'R²':<10} {'MSE':<10} {'MAE':<10}")
    print("-"*60)
    for zone in ['Core', 'Perimeter', 'Roof', 'Overall']:
        print(f"{zone:<15} {metrics[zone]['R2']:<10.4f} {metrics[zone]['MSE']:<10.4f} {metrics[zone]['MAE']:<10.4f}")
    print("="*60)


# ==================== 主函数 ====================

def main():
    """主函数 - 演示模型推理"""
    print("="*80)
    print("Masked ODE 模型推理")
    print("="*80)
    
    # 初始化预测器
    predictor = MaskedODEPredictor(
        model_path='models/masked_ode_best.pth',
        scaler_path='models/'
    )
    
    # 加载测试数据
    if not os.path.exists('multi_zone_building_data.csv'):
        print("错误: 未找到数据文件")
        return
    
    df = pd.read_csv('multi_zone_building_data.csv')
    print(f"\n数据加载完成: {len(df)} 行")
    
    # 准备测试数据
    df['Time'] = pd.to_datetime(df['Time'])
    df['hour'] = df['Time'].dt.hour
    df['month'] = df['Time'].dt.month
    
    # 取前100个样本作为测试
    df_test = df.iloc[:100]
    
    # 准备输入特征
    u_base = np.column_stack([
        df_test['Text'].values, df_test['GHI'].values,
        df_test['E_core'].values, df_test['E_peri'].values, df_test['E_roof'].values,
        df_test['T_core'].values, df_test['T_peri'].values, df_test['T_roof'].values,
        df_test['hour'].values / 24.0, df_test['month'].values / 12.0
    ])
    
    # 建筑类型one-hot
    building_encoder = LabelEncoder()
    building_encoded = building_encoder.fit_transform(df_test['Building_Type'])
    n_types = len(building_encoder.classes_)
    building_onehot = np.eye(n_types)[building_encoded]
    
    u_array = np.column_stack([u_base, building_onehot])
    x_array = df_test[['T_core', 'T_peri', 'T_roof']].values
    
    # 归一化
    u_scaled = predictor.u_scaler.transform(u_array)
    x_scaled = predictor.x_scaler.transform(x_array)
    
    # 创建序列
    seq_len = 24
    if len(x_scaled) > seq_len:
        T_init = x_scaled[0:1]
        U_seq = u_scaled[:seq_len].reshape(1, seq_len, -1)
        T_true = x_scaled[:seq_len].reshape(1, seq_len, 3)
        
        print(f"\n输入形状: T_init={T_init.shape}, U={U_seq.shape}")
        
        # 预测并评估
        result = predictor.predict_with_metrics(T_init, U_seq, T_true)
        
        # 打印指标
        print_metrics(result['metrics'])
        
        # 可视化
        visualize_prediction(result)
        
        print("\n推理完成!")
    else:
        print("错误: 数据量不足")


if __name__ == "__main__":
    main()
