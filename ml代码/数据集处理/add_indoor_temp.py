import pandas as pd
import numpy as np

INPUT_FILE = r'D:\SHIFDR\SHIFDR_snnode_improved_v3.6.1.csv'
OUTPUT_FILE = r'D:\SHIFDR\SHIFDR_with_indoor_temp_v6.csv'



df = pd.read_csv(INPUT_FILE, parse_dates=['监测时间'])
print(f"原数据行数: {len(df)} 条")

setpoint_map = {
    '办公楼': 25.0, '实验室': 23.0, '教学楼': 24.5,
    '综合楼': 25.0, '大学商业建筑': 25.5
}

np.random.seed(42)

df['室内温度_°C'] = df['建筑类型'].map(setpoint_map).fillna(25.0)

df['日期'] = df['监测时间'].dt.date
date_factor = df.groupby(['建筑编号', '日期']).ngroup() % 20 * 0.12 - 0.9


df['室内温度_°C'] = (
    df['室内温度_°C']
    + (df['环境温度_°C'] - df['室内温度_°C']) * 0.34
    - (df['空调系统出水温度_°C'] - 7.5) * 0.47
    + (df['空调系统能耗_kWh'] / 220) * (-1.0)
    + date_factor
    + 0.75
) + np.random.normal(0, 1.6, len(df))


temp = df['室内温度_°C'].copy()


low_mask = temp < 19.8
temp.loc[low_mask] += np.random.uniform(2.0, 5.0, low_mask.sum())


high_mask = temp > 26.2
temp.loc[high_mask] -= np.random.uniform(2.0, 5.0, high_mask.sum())


df['室内温度_°C'] = temp.clip(18.8, 27.8).round(2)


cols = list(df.columns)
indoor_idx = cols.index('环境温度_°C') + 1
cols.insert(indoor_idx, cols.pop(cols.index('室内温度_°C')))
df = df[cols]


df.to_csv(OUTPUT_FILE, index=False, encoding='utf-8-sig')
print(f"✅ v6 版本已生成！文件保存至：\n{OUTPUT_FILE}")


print("\n=== v6 分布验证 ===")
print(df['室内温度_°C'].describe().round(3))
print("\n18.8 和 27.8 的实际数量：")
print(f"18.8: {(df['室内温度_°C'] == 18.8).sum()} 条")
print(f"27.8: {(df['室内温度_°C'] == 27.8).sum()} 条")
print("\n出现次数最多的15个温度值：")
print(df['室内温度_°C'].value_counts().head(15).sort_index())