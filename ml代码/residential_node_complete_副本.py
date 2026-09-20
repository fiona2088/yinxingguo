"""
Residential NODE - Masked ODE 版本
整合: PINODE + Masked ODE (3区域) + 动态物理系数 + Season-native + 建筑类型感知

核心特性:
- 3区域 Masked ODE 架构 (Core, Perimeter, Roof)
- 动态物理系数 (R(t), C(t), COP(t)) 带3-mode分类
- 区域间热阻网络 (R_01, R_02, R_12)
- 可学习掩码矩阵控制区域连接
- Season-native 每日边界
- 建筑类型感知

作者: AI Assistant
日期: 2026
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
from sklearn.ensemble import IsolationForest
import os
from typing import Dict, Tuple, List, Optional
from dataclasses import dataclass
import random
import time
import joblib

# 设置随机种子
torch.manual_seed(42)
np.random.seed(42)
random.seed(42)

# 设备
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
print(f'使用设备: {device}')

# 创建必要目录
os.makedirs('data', exist_ok=True)
os.makedirs('models', exist_ok=True)
os.makedirs('visualizations', exist_ok=True)


# =============================================================================
# 配置类
# =============================================================================

@dataclass
class ModelConfig:
    """模型配置 - Masked ODE 3区域版本"""
    nx: int = 3                    # 3区域温度状态
    nu_base: int = 10              # [Text, GHI, E_core, E_peri, E_roof, T_core, T_peri, T_roof, hour_norm, month_norm]
    n_zones: int = 3               # 区域数量: Core, Perimeter, Roof
    hidden_dim: int = 128
    n_building_types: int = 8
    h: float = 3600.0              # 时间步长 (秒)
    epochs: int = 300
    lr: float = 5e-4  # 降低学习率
    patience: int = 50
    weight_decay: float = 1e-4
    batch_size: int = 32  # 减小batch size
    seq_len: int = 24

    w_data: float = 1.0
    w_physics: float = 0.1  # 降低物理损失权重
    w_mask: float = 0.01  # 降低掩码损失权重

    # 孤立森林异常检测参数
    contamination: float = 0.05    # 异常比例
    n_estimators: int = 100        # 树的数量
    anomaly_threshold: float = -0.3  # 异常分数阈值


# =============================================================================
# 1. 数据加载与预处理 (多区域版本)
# =============================================================================

class DataPreprocessor:
    def __init__(self, config: ModelConfig):
        self.config = config
        self.u_scaler = MinMaxScaler(feature_range=(0, 1))
        self.x_scaler = MinMaxScaler(feature_range=(0, 1))
        self.building_encoder = None
        self.isolation_forest = None
        self.anomaly_scores = None

    def load_data(self, file_path: str = 'multi_zone_building_data.csv') -> pd.DataFrame:
        print("=" * 80)
        print("1. 数据加载与预处理 (多区域版本)")
        print("=" * 80)

        # 使用多区域模拟数据
        if not os.path.exists(file_path):
            print(f"生成多区域模拟数据...")
            from generate_multi_zone_data import generate_multi_zone_dataset
            df = generate_multi_zone_dataset(n_buildings=30, hours_per_building=2000)
            df.to_csv(file_path, index=False)
        else:
            df = pd.read_csv(file_path)
            
        df['Time'] = pd.to_datetime(df['Time'])
        print(f"数据加载完成: {len(df)} 行")
        print(f"建筑类型数量: {df['Building_Type'].nunique()}")
        print(f"区域: Core, Perimeter, Roof")

        return df

    def extract_temporal_features(self, df: pd.DataFrame) -> pd.DataFrame:
        print("提取时间特征...")
        df['hour'] = df['Time'].dt.hour
        df['day_of_week'] = df['Time'].dt.dayofweek
        df['month'] = df['Time'].dt.month
        df['day'] = df['Time'].dt.date

        df['hour_norm'] = df['hour'] / 24.0
        df['month_norm'] = (df['month'] - 1) / 11.0

        return df

    def encode_building_types(self, df: pd.DataFrame) -> Tuple[np.ndarray, LabelEncoder]:
        print("编码建筑类型...")
        self.building_encoder = LabelEncoder()
        encoded = self.building_encoder.fit_transform(df['Building_Type'])
        n_types = len(self.building_encoder.classes_)
        onehot = np.eye(n_types)[encoded]

        print(f"建筑类型: {n_types} 种")
        for i, name in enumerate(self.building_encoder.classes_):
            print(f"  {i}: {name}")

        self.config.n_building_types = n_types
        return onehot, self.building_encoder

    def detect_anomalies_isolation_forest(self, df: pd.DataFrame) -> pd.DataFrame:
        """使用孤立森林检测异常"""
        print("\n" + "=" * 80)
        print("孤立森林异常检测")
        print("=" * 80)
        
        # 选择用于异常检测的特征
        features_for_anomaly = ['Text', 'GHI', 'E_core', 'E_peri', 'E_roof', 
                                'T_core', 'T_peri', 'T_roof']
        X_anomaly = df[features_for_anomaly].values
        
        # 初始化并训练孤立森林
        self.isolation_forest = IsolationForest(
            n_estimators=self.config.n_estimators,
            contamination=self.config.contamination,
            random_state=42,
            n_jobs=-1
        )
        
        # 拟合并预测
        anomaly_labels = self.isolation_forest.fit_predict(X_anomaly)
        anomaly_scores = self.isolation_forest.decision_function(X_anomaly)
        
        # 添加到DataFrame
        df['anomaly_label'] = anomaly_labels  # 1: 正常, -1: 异常
        df['anomaly_score'] = anomaly_scores
        df['is_anomaly'] = (anomaly_labels == -1).astype(int)
        
        # 统计
        n_anomalies = df['is_anomaly'].sum()
        print(f"检测到的异常样本数: {n_anomalies} ({n_anomalies/len(df)*100:.2f}%)")
        print(f"异常分数范围: [{anomaly_scores.min():.3f}, {anomaly_scores.max():.3f}]")
        
        # 保存模型
        joblib.dump(self.isolation_forest, 'models/isolation_forest_model.pkl')
        print("孤立森林模型已保存到: models/isolation_forest_model.pkl")
        
        return df
    
    def prepare_features(self, df: pd.DataFrame) -> Dict:
        start_time = time.time()
        print("准备特征...")
        
        df = self.extract_temporal_features(df)
        
        # 异常检测
        df = self.detect_anomalies_isolation_forest(df)
        
        building_onehot, _ = self.encode_building_types(df)

        # 输入特征: [Text, GHI, E_core, E_peri, E_roof, T_core, T_peri, T_roof, hour_norm, month_norm]
        u_base = np.column_stack([
            df['Text'].values,
            df['GHI'].values,
            df['E_core'].values,
            df['E_peri'].values,
            df['E_roof'].values,
            df['T_core'].values,
            df['T_peri'].values,
            df['T_roof'].values,
            df['hour_norm'].values,
            df['month_norm'].values,
        ])

        # 添加建筑类型one-hot
        u_array = np.column_stack([u_base, building_onehot])

        # 目标: 3区域温度
        x_array = df[['T_core', 'T_peri', 'T_roof']].values

        print(f"\n特征维度:")
        print(f"  U: {u_array.shape} (基础{self.config.nu_base}维 + 建筑类型{building_onehot.shape[1]}维)")
        print(f"  X: {x_array.shape} (3区域温度)")

        u_scaled = self.u_scaler.fit_transform(u_array)
        x_scaled = self.x_scaler.fit_transform(x_array)
        
        print(f"特征准备完成，耗时: {time.time() - start_time:.2f}秒")

        return {
            'df': df,
            'u': u_scaled,
            'x': x_scaled,
            'building_onehot': building_onehot,
            'u_scaler': self.u_scaler,
            'x_scaler': self.x_scaler,
        }

    def create_sequences(self, data: Dict, seq_len: int = 24) -> Dict:
        """创建序列数据（过滤异常序列）"""
        start_time = time.time()
        print("\n" + "=" * 80)
        print("2. 创建序列数据")
        print("=" * 80)

        df = data['df']
        u_array = data['u']
        x_array = data['x']

        X_list, U_list, anomaly_list = [], [], []

        for b_id in df['Building_ID'].unique():
            mask = df['Building_ID'] == b_id
            idx = df[mask].index

            x_b = x_array[idx]
            u_b = u_array[idx]
            anomaly_b = df.loc[idx, 'is_anomaly'].values

            for i in range(len(x_b) - seq_len):
                X_list.append(x_b[i:i+seq_len])
                U_list.append(u_b[i:i+seq_len])
                # 如果序列中有任何异常点，标记整个序列为异常
                anomaly_list.append(anomaly_b[i:i+seq_len].max())

        X = np.array(X_list)
        U = np.array(U_list)
        anomaly_labels = np.array(anomaly_list)

        # 分离正常和异常序列
        normal_mask = anomaly_labels == 0
        anomaly_mask = anomaly_labels == 1
        
        print(f"总序列数: {len(X_list)}")
        print(f"正常序列: {normal_mask.sum()} ({normal_mask.sum()/len(X_list)*100:.1f}%)")
        print(f"异常序列: {anomaly_mask.sum()} ({anomaly_mask.sum()/len(X_list)*100:.1f}%)")
        print(f"序列长度: {seq_len}")
        print(f"X形状: {X.shape}, U形状: {U.shape}")

        # 只使用正常序列进行训练
        X_normal = X[normal_mask]
        U_normal = U[normal_mask]
        
        # 划分训练/验证/测试
        n = len(X_normal)
        train_end = int(n * 0.7)
        val_end = int(n * 0.85)

        def to_tensor(d):
            return {k: torch.tensor(v, dtype=torch.float32).to(device)
                    for k, v in d.items()}

        train = {'X': X_normal[:train_end], 'U': U_normal[:train_end]}
        val = {'X': X_normal[train_end:val_end], 'U': U_normal[train_end:val_end]}
        test = {'X': X_normal[val_end:], 'U': U_normal[val_end:]}
        
        # 保存异常序列用于测试异常检测
        if anomaly_mask.sum() > 0:
            X_anomaly = X[anomaly_mask]
            U_anomaly = U[anomaly_mask]
            print(f"异常序列已分离: {len(X_anomaly)} 个")
            np.save('data/anomaly_sequences_X.npy', X_anomaly)
            np.save('data/anomaly_sequences_U.npy', U_anomaly)

        print(f"训练集: {train_end}, 验证集: {val_end-train_end}, 测试集: {n-val_end}")
        print(f"序列创建完成，耗时: {time.time() - start_time:.2f}秒")

        return to_tensor(train), to_tensor(val), to_tensor(test)


# =============================================================================
# 2. Masked ODE 模型组件
# =============================================================================

class DynamicPhysicsCoefficients(nn.Module):
    """
    动态物理系数网络 - 3-mode分类: 低温(<5°C), 正常(5-25°C), 高温(>25°C)
    """
    def __init__(self, hidden_size: int = 64):
        super().__init__()
        
        # 工况分类器
        self.mode_classifier = nn.Sequential(
            nn.Linear(4, hidden_size),
            nn.ReLU(),
            nn.Linear(hidden_size, 3),
            nn.Softmax(dim=-1)
        )
        
        # 模式特定的参数生成器
        self.R_generator = nn.ModuleList([
            nn.Sequential(nn.Linear(4, hidden_size), nn.ReLU(), nn.Linear(hidden_size, 3)),
            nn.Sequential(nn.Linear(4, hidden_size), nn.ReLU(), nn.Linear(hidden_size, 3)),
            nn.Sequential(nn.Linear(4, hidden_size), nn.ReLU(), nn.Linear(hidden_size, 3)),
        ])
        
        self.C_generator = nn.ModuleList([
            nn.Sequential(nn.Linear(4, hidden_size), nn.ReLU(), nn.Linear(hidden_size, 3)),
            nn.Sequential(nn.Linear(4, hidden_size), nn.ReLU(), nn.Linear(hidden_size, 3)),
            nn.Sequential(nn.Linear(4, hidden_size), nn.ReLU(), nn.Linear(hidden_size, 3)),
        ])
        
        self.COP_generator = nn.ModuleList([
            nn.Sequential(nn.Linear(4, hidden_size), nn.ReLU(), nn.Linear(hidden_size, 1)),
            nn.Sequential(nn.Linear(4, hidden_size), nn.ReLU(), nn.Linear(hidden_size, 1)),
            nn.Sequential(nn.Linear(4, hidden_size), nn.ReLU(), nn.Linear(hidden_size, 1)),
        ])
        
        # 可学习的基线参数
        self.R_base = nn.Parameter(torch.ones(3) * 0.5)
        self.C_base = nn.Parameter(torch.ones(3) * 500.0)
        self.COP_base = nn.Parameter(torch.tensor([2.5, 3.0, 2.8]))
        
    def forward(self, conditions: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
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
    """
    区域间热阻网络 - R_01 (Core-Perimeter), R_02 (Core-Roof), R_12 (Perimeter-Roof)
    """
    def __init__(self, hidden_size: int = 32):
        super().__init__()
        
        self.R_inter_net = nn.Sequential(
            nn.Linear(4, hidden_size),
            nn.ReLU(),
            nn.Linear(hidden_size, 3),
            nn.Softplus()
        )
        
        self.R_inter_base = nn.Parameter(torch.tensor([2.0, 3.0, 2.5]))
        
    def forward(self, conditions: torch.Tensor) -> torch.Tensor:
        R_dynamic = self.R_inter_net(conditions)
        R_inter = R_dynamic + self.R_inter_base.unsqueeze(0)
        return R_inter


class MaskMatrix(nn.Module):
    """
    可学习的掩码矩阵 - 控制区域间的连接强度
    """
    def __init__(self, n_zones: int = 3, hidden_size: int = 32):
        super().__init__()
        self.n_zones = n_zones
        
        self.mask_net = nn.Sequential(
            nn.Linear(3, hidden_size),
            nn.ReLU(),
            nn.Linear(hidden_size, n_zones * n_zones),
            nn.Sigmoid()
        )
        
        self.mask_base = nn.Parameter(torch.eye(n_zones) * 0.8 + 0.1)
        
    def forward(self, conditions: torch.Tensor) -> torch.Tensor:
        batch_size = conditions.shape[0]
        
        mask_dynamic = self.mask_net(conditions).view(batch_size, self.n_zones, self.n_zones)
        mask = mask_dynamic + self.mask_base.unsqueeze(0)
        mask = torch.clamp(mask, 0, 1)
        mask = (mask + mask.transpose(1, 2)) / 2  # 对称化
        
        return mask


class MaskedODEFunction(nn.Module):
    """
    Masked ODE 动力学函数 - dT/dt = f(T, u, t)
    """
    def __init__(self, config: ModelConfig):
        super().__init__()
        self.config = config
        self.n_zones = config.n_zones
        
        self.physics_coeffs = DynamicPhysicsCoefficients()
        self.inter_zone_R = InterZoneThermalResistance()
        self.mask_matrix = MaskMatrix(n_zones=config.n_zones)
        
        # 神经网络残差
        self.net = nn.Sequential(
            nn.Linear(config.nu_base + config.n_building_types + config.n_zones, config.hidden_dim),
            nn.ReLU(),
            nn.Linear(config.hidden_dim, config.hidden_dim),
            nn.ReLU(),
            nn.Linear(config.hidden_dim, config.n_zones)
        )
        
    def physics_layer(self, T_zones, Text, GHI, E_zones, conditions):
        """物理层 - RC热网络"""
        batch_size = T_zones.shape[0]
        
        R, C, COP = self.physics_coeffs(conditions)
        
        # 区域间热阻
        wind = torch.ones_like(Text) * 2.0
        T_diff = torch.abs(Text - T_zones.mean(dim=1, keepdim=True))
        inter_conditions = torch.cat([Text, GHI, wind, T_diff], dim=-1)
        R_inter = self.inter_zone_R(inter_conditions)
        
        # 掩码矩阵
        occupancy = (E_zones.sum(dim=1, keepdim=True) > 0).float()
        mask_conditions = torch.cat([Text, conditions[:, 2:3], occupancy], dim=-1)
        mask = self.mask_matrix(mask_conditions)
        
        # 外部热流 - 添加数值稳定性
        R_safe = R + 1e-6
        Q_ext = (Text - T_zones) / R_safe
        
        # 太阳辐射热流
        solar_gain = torch.zeros_like(T_zones)
        solar_gain[:, 2] = GHI.squeeze(-1) * 0.001
        solar_gain[:, 1] = GHI.squeeze(-1) * 0.0003
        
        # 区域间热流
        T_diff_matrix = T_zones.unsqueeze(2) - T_zones.unsqueeze(1)
        
        R_inter_matrix = torch.zeros(batch_size, 3, 3, device=T_zones.device)
        R_inter_matrix[:, 0, 1] = R_inter[:, 0]
        R_inter_matrix[:, 1, 0] = R_inter[:, 0]
        R_inter_matrix[:, 0, 2] = R_inter[:, 1]
        R_inter_matrix[:, 2, 0] = R_inter[:, 1]
        R_inter_matrix[:, 1, 2] = R_inter[:, 2]
        R_inter_matrix[:, 2, 1] = R_inter[:, 2]
        R_inter_matrix = R_inter_matrix + 1e-6  # 防止除零
        
        Q_inter = (mask * T_diff_matrix / R_inter_matrix).sum(dim=2)
        
        # HVAC热流 - 添加数值稳定性
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
        
        dTdt = dTdt_physics + dTdt_nn
        
        return dTdt


class CompleteResidentialNODE(nn.Module):
    """完整的 Masked ODE 模型"""
    def __init__(self, config: ModelConfig):
        super().__init__()
        self.config = config
        self.n_zones = config.n_zones
        self.nu_total = config.nu_base + config.n_building_types

        self.ode_func = MaskedODEFunction(config)
        
        # 权重初始化
        self._initialize_weights()
        
        self.to(device)
        print(f"\n模型初始化 (Masked ODE):")
        print(f"  区域数量: {config.n_zones}")
        print(f"  输入维度: {self.nu_total}")
        print(f"  隐藏维度: {config.hidden_dim}")
    
    def _initialize_weights(self):
        """初始化权重，提高数值稳定性"""
        for m in self.modules():
            if isinstance(m, nn.Linear):
                nn.init.xavier_uniform_(m.weight, gain=0.1)
                if m.bias is not None:
                    nn.init.zeros_(m.bias)

    def rk4_step(self, state, u, dt=3600.0):
        """RK4积分"""
        t = torch.tensor(0.0, device=state.device)
        
        k1 = self.ode_func(t, state, u)
        k2 = self.ode_func(t, state + dt/2 * k1, u)
        k3 = self.ode_func(t, state + dt/2 * k2, u)
        k4 = self.ode_func(t, state + dt * k3, u)
        
        return state + dt/6 * (k1 + 2*k2 + 2*k3 + k4)

    def forward(self, T_init, U):
        """
        T_init: [batch, n_zones] 初始温度
        U: [batch, seq_len, nu] 输入序列
        """
        batch_size, seq_len, _ = U.shape

        T_list = []
        T_current = T_init

        for t in range(seq_len):
            u_t = U[:, t, :]
            T_current = self.rk4_step(T_current, u_t, dt=self.config.h)
            T_list.append(T_current.unsqueeze(1))

        return torch.cat(T_list, dim=1)

    def compute_loss(self, T_pred, T_true, U):
        """综合损失函数"""
        # 1. 数据拟合损失
        loss_data = F.mse_loss(T_pred, T_true)

        # 2. 物理一致性损失
        Text = U[:, :, 0]
        T_avg_pred = T_pred.mean(dim=2)
        physics_violation = F.relu(T_avg_pred - Text - 10).mean()
        physics_violation += F.relu(Text - T_avg_pred - 5).mean()

        # 3. 掩码正则化
        with torch.no_grad():
            sample_u = U[:, 0, :]
            sample_conditions = torch.cat([
                sample_u[:, 0:1],
                sample_u[:, 8:9],
                (sample_u[:, 2:5].sum(dim=1, keepdim=True) > 0).float()
            ], dim=-1)
            mask = self.ode_func.mask_matrix(sample_conditions)
        loss_mask = mask.mean() * 0.1

        total_loss = (self.config.w_data * loss_data + 
                     self.config.w_physics * physics_violation +
                     self.config.w_mask * loss_mask)

        return {
            'total': total_loss,
            'data': loss_data,
            'physics': physics_violation,
            'mask': loss_mask
        }


# =============================================================================
# 3. 训练与评估
# =============================================================================

def train_model(model, train_data, val_data, config):
    print("\n开始训练 Masked ODE 模型...")
    optimizer = torch.optim.AdamW(model.parameters(), lr=config.lr, weight_decay=config.weight_decay)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(optimizer, patience=20, factor=0.5)

    best_r2 = -float('inf')
    patience_cnt = 0
    history = {'train': [], 'val': [], 'r2': []}

    print(f"训练参数: epochs={config.epochs}, lr={config.lr}, batch_size={config.batch_size}")
    print("-" * 80)

    for epoch in range(config.epochs):
        start_epoch = time.time()
        
        # 训练
        model.train()
        total_loss = 0
        total_data_loss = 0
        total_physics_loss = 0
        total_mask_loss = 0
        num_batches = len(train_data['X']) // config.batch_size
        
        print(f"\n[Epoch {epoch+1}/{config.epochs}] 开始训练...")
        
        for batch_idx in range(num_batches):
            batch_start = time.time()
            start = batch_idx * config.batch_size
            end = start + config.batch_size
            
            T_init = train_data['X'][start:end, 0]
            T_true = train_data['X'][start:end]
            U = train_data['U'][start:end]
            
            T_pred = model(T_init, U)
            losses = model.compute_loss(T_pred, T_true, U)
            
            # 检查损失是否为NaN
            if torch.isnan(losses['total']):
                print(f"  [警告] Batch {batch_idx+1} 出现NaN，跳过此batch")
                continue
            
            optimizer.zero_grad()
            losses['total'].backward()
            
            # 更严格的梯度裁剪
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=0.5)
            
            optimizer.step()
            
            total_loss += losses['total'].item()
            total_data_loss += losses['data'].item()
            total_physics_loss += losses['physics'].item()
            total_mask_loss += losses['mask'].item()
            
            # 累积计算R²（使用Welford算法思想，更稳定）
            with torch.no_grad():
                batch_mse = F.mse_loss(T_pred, T_true).item()
                batch_mean = T_true.mean().item()
                batch_var = ((T_true - batch_mean) ** 2).mean().item()
                batch_r2 = 1 - batch_mse / (batch_var + 1e-8) if batch_var > 1e-8 else 0.0
            
            # 每10个batch输出一次进度
            if (batch_idx + 1) % 10 == 0 or batch_idx == num_batches - 1:
                avg_loss_so_far = total_loss / (batch_idx + 1)
                print(f"  Batch [{batch_idx+1}/{num_batches}] 平均损失={avg_loss_so_far:.5f}, "
                      f"当前损失={losses['total'].item():.5f}, "
                      f"Batch R²={batch_r2:.4f}, 耗时={time.time()-batch_start:.2f}s")
        
        avg_train_loss = total_loss / num_batches if num_batches > 0 else 0
        avg_data_loss = total_data_loss / num_batches if num_batches > 0 else 0
        avg_physics_loss = total_physics_loss / num_batches if num_batches > 0 else 0
        avg_mask_loss = total_mask_loss / num_batches if num_batches > 0 else 0

        # 验证
        model.eval()
        with torch.no_grad():
            total_val_loss = 0
            total_val_data_loss = 0
            total_val_physics_loss = 0
            total_val_mask_loss = 0
            val_num_batches = len(val_data['X']) // config.batch_size
            all_preds = []
            all_trues = []
            
            print(f"[Epoch {epoch+1}/{config.epochs}] 开始验证...")
            
            for batch_idx in range(val_num_batches):
                start = batch_idx * config.batch_size
                end = start + config.batch_size
                
                T_init_v = val_data['X'][start:end, 0]
                T_true_v = val_data['X'][start:end]
                U_v = val_data['U'][start:end]
                
                T_pred_v = model(T_init_v, U_v)
                losses_v = model.compute_loss(T_pred_v, T_true_v, U_v)
                
                total_val_loss += losses_v['total'].item()
                total_val_data_loss += losses_v['data'].item()
                total_val_physics_loss += losses_v['physics'].item()
                total_val_mask_loss += losses_v['mask'].item()
                all_preds.append(T_pred_v)
                all_trues.append(T_true_v)
            
            avg_val_loss = total_val_loss / val_num_batches if val_num_batches > 0 else 0
            avg_val_data_loss = total_val_data_loss / val_num_batches if val_num_batches > 0 else 0
            avg_val_physics_loss = total_val_physics_loss / val_num_batches if val_num_batches > 0 else 0
            avg_val_mask_loss = total_val_mask_loss / val_num_batches if val_num_batches > 0 else 0
            
            # 计算R²
            if all_preds and all_trues:
                all_preds = torch.cat(all_preds)
                all_trues = torch.cat(all_trues)
                mse = F.mse_loss(all_preds, all_trues)
                var = torch.var(all_trues)
                r2 = 1 - mse / var if var > 1e-8 else torch.tensor(-1.0)
            else:
                r2 = torch.tensor(-1.0)

        history['train'].append(avg_train_loss)
        history['val'].append(avg_val_loss)
        history['r2'].append(r2.item())

        scheduler.step(avg_val_loss)

        epoch_time = time.time() - start_epoch
        
        # 详细的epoch总结输出
        print(f"\n{'='*80}")
        print(f"[Epoch {epoch+1}/{config.epochs}] 完成!")
        print(f"{'='*80}")
        print(f"训练损失: 总={avg_train_loss:.5f}, 数据={avg_data_loss:.5f}, 物理={avg_physics_loss:.5f}, 掩码={avg_mask_loss:.5f}")
        print(f"验证损失: 总={avg_val_loss:.5f}, 数据={avg_val_data_loss:.5f}, 物理={avg_val_physics_loss:.5f}, 掩码={avg_val_mask_loss:.5f}")
        print(f"R² Score: {r2.item():.4f}")
        print(f"学习率: {optimizer.param_groups[0]['lr']:.6f}")
        print(f"耗时: {epoch_time:.2f}秒")
        print(f"{'='*80}\n")
        
        # 每10个epoch保存实时可视化
        if (epoch + 1) % 10 == 0:
            plt.figure(figsize=(12, 4))
            
            plt.subplot(1, 3, 1)
            plt.plot(history['train'], label='Train Loss', color='blue')
            plt.plot(history['val'], label='Val Loss', color='red')
            plt.xlabel('Epoch')
            plt.ylabel('Loss')
            plt.title('Training & Validation Loss')
            plt.legend()
            plt.grid(True, alpha=0.3)
            
            plt.subplot(1, 3, 2)
            plt.plot(history['r2'], label='R²', color='green')
            plt.axhline(y=0.9, color='r', linestyle='--', label='Target R²=0.9')
            plt.xlabel('Epoch')
            plt.ylabel('R²')
            plt.title(f'Validation R² (Current: {r2.item():.4f})')
            plt.legend()
            plt.grid(True, alpha=0.3)
            
            plt.subplot(1, 3, 3)
            plt.plot(history['train'], label='Train', color='blue', alpha=0.7)
            plt.plot(history['val'], label='Val', color='red', alpha=0.7)
            plt.yscale('log')
            plt.xlabel('Epoch')
            plt.ylabel('Loss (log scale)')
            plt.title('Loss (Log Scale)')
            plt.legend()
            plt.grid(True, alpha=0.3)
            
            plt.tight_layout()
            os.makedirs('visualizations', exist_ok=True)
            plt.savefig(f'visualizations/training_progress_epoch_{epoch+1}.png', dpi=100, bbox_inches='tight')
            print(f"[可视化已保存] visualizations/training_progress_epoch_{epoch+1}.png")
            plt.close()

        # 保存当前epoch模型
        os.makedirs('checkpoints', exist_ok=True)
        torch.save({
            'epoch': epoch + 1,
            'model_state_dict': model.state_dict(),
            'optimizer_state_dict': optimizer.state_dict(),
            'r2': r2.item(),
            'train_loss': avg_train_loss,
            'val_loss': avg_val_loss,
        }, f'checkpoints/epoch_{epoch+1:03d}_r2_{r2.item():.4f}.pth')
        print(f"[模型已保存] checkpoints/epoch_{epoch+1:03d}_r2_{r2.item():.4f}.pth")
        
        # 保存最佳模型
        if r2.item() > best_r2:
            best_r2 = r2.item()
            patience_cnt = 0
            torch.save(model.state_dict(), 'models/masked_ode_best.pth')
            print(f"[最佳模型更新] R² = {best_r2:.4f}")
        else:
            patience_cnt += 1
            if patience_cnt > config.patience:
                print(f"早停触发于 epoch {epoch+1}")
                break

    # 加载最佳模型
    if os.path.exists('models/masked_ode_best.pth'):
        model.load_state_dict(torch.load('models/masked_ode_best.pth'))
    
    print(f"\n最佳R²: {max(history['r2']):.4f}")
    return model, history


def evaluate_model(model, test_data, preprocessor):
    print("\n" + "=" * 80)
    print("模型评估")
    print("=" * 80)

    model.eval()
    with torch.no_grad():
        T_init = test_data['X'][:, 0]
        T_pred = model(T_init, test_data['U'])

        T_true = test_data['X'].cpu().numpy()
        T_pred = T_pred.cpu().numpy()

        # 反归一化
        T_true_denorm = preprocessor.x_scaler.inverse_transform(
            T_true.reshape(-1, 3)).reshape(T_true.shape)
        T_pred_denorm = preprocessor.x_scaler.inverse_transform(
            T_pred.reshape(-1, 3)).reshape(T_pred.shape)

        # 计算每个区域的R²
        zone_names = ['Core', 'Perimeter', 'Roof']
        for i, name in enumerate(zone_names):
            r2_zone = r2_score(T_true_denorm[:, :, i].flatten(), T_pred_denorm[:, :, i].flatten())
            print(f"{name}区域 R²: {r2_zone:.4f}")

        # 整体R²
        r2_overall = r2_score(T_true_denorm.flatten(), T_pred_denorm.flatten())
        mse = mean_squared_error(T_true_denorm.flatten(), T_pred_denorm.flatten())
        mae = mean_absolute_error(T_true_denorm.flatten(), T_pred_denorm.flatten())

        print(f"\n整体 MSE: {mse:.4f}")
        print(f"整体 MAE: {mae:.4f}")
        print(f"整体 R²: {r2_overall:.4f}")

        return r2_overall


def evaluate_anomaly_detection(preprocessor, test_data):
    """评估异常检测性能"""
    print("\n" + "=" * 80)
    print("异常检测评估")
    print("=" * 80)
    
    # 加载异常序列
    if os.path.exists('data/anomaly_sequences_X.npy'):
        X_anomaly = np.load('data/anomaly_sequences_X.npy')
        U_anomaly = np.load('data/anomaly_sequences_U.npy')
        
        # 使用孤立森林重新检测
        features_for_anomaly = ['Text', 'GHI', 'E_core', 'E_peri', 'E_roof', 
                                'T_core', 'T_peri', 'T_roof']
        
        # 反归一化U数据以获取原始特征
        U_anomaly_denorm = preprocessor.u_scaler.inverse_transform(
            U_anomaly.reshape(-1, U_anomaly.shape[-1])).reshape(U_anomaly.shape)
        
        # 提取异常检测特征
        X_anomaly_flat = X_anomaly.reshape(-1, 3)
        U_anomaly_flat = U_anomaly_denorm[:, :, :8].reshape(-1, 8)  # 前8维是异常检测特征
        
        # 组合特征
        combined_features = np.column_stack([U_anomaly_flat, X_anomaly_flat])
        
        # 预测
        anomaly_pred = preprocessor.isolation_forest.predict(combined_features)
        anomaly_scores = preprocessor.isolation_forest.decision_function(combined_features)
        
        # 统计
        detected_anomalies = (anomaly_pred == -1).sum()
        print(f"异常序列总数: {len(X_anomaly)}")
        print(f"检测到的异常: {detected_anomalies} ({detected_anomalies/len(combined_features)*100:.2f}%)")
        print(f"平均异常分数: {anomaly_scores.mean():.3f}")
        
        return anomaly_scores
    else:
        print("未找到异常序列数据")
        return None


def plot_results(history, model, test_data, preprocessor):
    print("\n生成可视化...")

    fig, axes = plt.subplots(2, 3, figsize=(18, 10))

    # 1. 损失曲线
    ax = axes[0, 0]
    ax.plot(history['train'], label='Train', alpha=0.8)
    ax.plot(history['val'], label='Val', alpha=0.8)
    ax.set_xlabel('Epoch')
    ax.set_ylabel('Loss')
    ax.set_title('Training History')
    ax.legend()
    ax.grid(True, alpha=0.3)

    # 2. R² 曲线
    ax = axes[0, 1]
    ax.plot(history['r2'], color='green', alpha=0.8)
    ax.set_xlabel('Epoch')
    ax.set_ylabel('R²')
    ax.set_title('Validation R²')
    ax.axhline(y=0.9, color='r', linestyle='--', label='Target R²=0.9')
    ax.legend()
    ax.grid(True, alpha=0.3)

    # 3. 异常检测分数分布
    ax = axes[0, 2]
    if preprocessor.isolation_forest is not None and hasattr(preprocessor, 'anomaly_scores'):
        ax.hist(preprocessor.anomaly_scores, bins=50, alpha=0.7, color='blue', edgecolor='black')
        ax.axvline(x=-0.3, color='r', linestyle='--', label='Threshold')
        ax.set_xlabel('Anomaly Score')
        ax.set_ylabel('Frequency')
        ax.set_title('Isolation Forest Anomaly Scores')
        ax.legend()
        ax.grid(True, alpha=0.3)

    # 4. 预测 vs 真实 (Core区域)
    model.eval()
    with torch.no_grad():
        T_init = test_data['X'][:, 0]
        T_pred = model(T_init, test_data['U'])
        T_true = test_data['X'].cpu().numpy()
        T_pred = T_pred.cpu().numpy()

        T_true_denorm = preprocessor.x_scaler.inverse_transform(
            T_true.reshape(-1, 3)).reshape(T_true.shape)
        T_pred_denorm = preprocessor.x_scaler.inverse_transform(
            T_pred.reshape(-1, 3)).reshape(T_pred.shape)

    ax = axes[1, 0]
    sample_idx = np.random.randint(0, len(T_true_denorm))
    ax.plot(T_true_denorm[sample_idx, :, 0], label='True Core', alpha=0.8)
    ax.plot(T_pred_denorm[sample_idx, :, 0], label='Pred Core', alpha=0.8)
    ax.set_xlabel('Time Step')
    ax.set_ylabel('Temperature (°C)')
    ax.set_title(f'Sample Prediction (Core Zone)')
    ax.legend()
    ax.grid(True, alpha=0.3)

    # 5. 散点图
    ax = axes[1, 1]
    ax.scatter(T_true_denorm[:, :, 0].flatten(), T_pred_denorm[:, :, 0].flatten(), alpha=0.3, s=1)
    ax.plot([T_true_denorm[:, :, 0].min(), T_true_denorm[:, :, 0].max()],
            [T_true_denorm[:, :, 0].min(), T_true_denorm[:, :, 0].max()], 'r--', lw=2)
    ax.set_xlabel('True')
    ax.set_ylabel('Predicted')
    ax.set_title('Predictions vs Ground Truth (Core)')
    ax.grid(True, alpha=0.3)

    # 6. 3区域温度对比
    ax = axes[1, 2]
    time_steps = np.arange(24)
    ax.plot(time_steps, T_true_denorm[sample_idx, :, 0], 'b-', label='Core (True)', alpha=0.8)
    ax.plot(time_steps, T_pred_denorm[sample_idx, :, 0], 'b--', label='Core (Pred)', alpha=0.8)
    ax.plot(time_steps, T_true_denorm[sample_idx, :, 1], 'g-', label='Perimeter (True)', alpha=0.8)
    ax.plot(time_steps, T_pred_denorm[sample_idx, :, 1], 'g--', label='Perimeter (Pred)', alpha=0.8)
    ax.plot(time_steps, T_true_denorm[sample_idx, :, 2], 'r-', label='Roof (True)', alpha=0.8)
    ax.plot(time_steps, T_pred_denorm[sample_idx, :, 2], 'r--', label='Roof (Pred)', alpha=0.8)
    ax.set_xlabel('Time Step')
    ax.set_ylabel('Temperature (°C)')
    ax.set_title('All Zones Prediction')
    ax.legend(fontsize=8)
    ax.grid(True, alpha=0.3)

    plt.tight_layout()
    plt.savefig('visualizations/masked_ode_results.png', dpi=150, bbox_inches='tight')
    print(f"可视化已保存到: visualizations/masked_ode_results.png")
    plt.close()


# =============================================================================
# 4. 主函数
# =============================================================================

def main():
    print("=" * 80)
    print("Residential NODE - Masked ODE 版本")
    print("整合: 3区域Masked ODE + 动态物理系数 + Season-native")
    print("=" * 80)

    config = ModelConfig()
    preprocessor = DataPreprocessor(config)

    # 加载数据
    df = preprocessor.load_data()

    # 特征工程
    data = preprocessor.prepare_features(df)

    # 创建序列
    train_d, val_d, test_d = preprocessor.create_sequences(data, seq_len=24)

    # 初始化模型
    model = CompleteResidentialNODE(config).to(device)
    total_params = sum(p.numel() for p in model.parameters())
    print(f"\n总参数量: {total_params:,}")

    # 训练
    model, history = train_model(model, train_d, val_d, config)

    # 评估
    r2 = evaluate_model(model, test_d, preprocessor)
    
    # 异常检测评估
    evaluate_anomaly_detection(preprocessor, test_d)

    # 可视化
    plot_results(history, model, test_d, preprocessor)

    print("\n" + "=" * 80)
    print("训练完成!")
    print(f"最终测试 R²: {r2:.4f}")
    print("最佳模型已保存到: models/masked_ode_best.pth")
    print("=" * 80)

    return model, r2, history


if __name__ == "__main__":
    model, r2, history = main()
