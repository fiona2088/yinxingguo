import os
import pandas as pd
import numpy as np
from scipy.integrate import odeint
from scipy.interpolate import interp1d
from datetime import timedelta


BASE_DIR = r"D:\SHIFDR"
PREPROCESSED_DIR = os.path.join(BASE_DIR, "2021_preprocessed_data", "2021 preprocessed data")
BUILDING_INFO = os.path.join(BASE_DIR, "BuildingInformation.csv")
OUTPUT_FILE = os.path.join(BASE_DIR, "SHIFDR_snnode_improved_v3.3.csv")
ADD_ROWS = 500



df_build = pd.read_csv(BUILDING_INFO)
df_build.columns = df_build.columns.str.strip()
name_col = df_build.columns[0]
buildings = df_build[name_col].str.strip().tolist()


building_map = {
    'Aral': '办公楼',
    'Caspian': '实验室',
    'Huron': '教学楼',
    'Michigan': '综合楼',
    'Superior': '办公楼',
    'Victoria': '大学商业建筑',
    'Baikal': '大学商业建筑',
    'Erie': '大学商业建筑',
    'Ladoga': '大学商业建筑',
    'Malawi': '大学商业建筑',
    'Ontario': '大学商业建筑',
    'Titicaca': '大学商业建筑',
    'Vostok': '大学商业建筑',
    'Winnipeg': '大学商业建筑'
}

all_data = []

for lake in buildings:
    pre_file = os.path.join(PREPROCESSED_DIR, f"{lake}.csv")
    if not os.path.exists(pre_file):
        print(f"  跳过 {lake}: 文件不存在")
        continue

    print(f"  处理 {lake}")

    df = pd.read_csv(pre_file)
    df.columns = [col.strip() for col in df.columns]

    if 'DATE' in df.columns and 'TIME' in df.columns:
        df['datetime'] = pd.to_datetime(df['DATE']) + pd.to_timedelta(df['TIME'], unit='m')
    else:
        print(f"  跳过 {lake}: 无 DATE/TIME 列")
        continue

    df['监测时间'] = df['datetime'].dt.floor('h')

    hum_col = next((c for c in df.columns if 'HUM' in c.upper()), None)
    oa_col = next((c for c in df.columns if 'OA' in c.upper() or 'OUT' in c.upper()), None)
    chws_col = next((c for c in df.columns if 'CHWS' in c.upper()), None)
    chwr_col = next((c for c in df.columns if 'CHWR' in c.upper()), None)

    df['湿度_%RH'] = df[hum_col] if hum_col else np.nan
    df['环境温度_°C'] = (df[oa_col] - 32) * 5 / 9 if oa_col else np.nan
    df['空调系统出水温度_°C'] = (df[chws_col] - 32) * 5 / 9 if chws_col else np.nan
    df['空调系统回水温度_°C'] = (df[chwr_col] - 32) * 5 / 9 if chwr_col else np.nan

    power_cols = [c for c in df.columns if 'POW' in c.upper() or 'CUR' in c.upper()]
    if power_cols:
        df['空调系统能耗_kWh'] = df[power_cols].sum(axis=1)

    hourly = df.groupby('监测时间').agg({
        '空调系统能耗_kWh': 'mean',
        '环境温度_°C': 'mean',
        '湿度_%RH': 'mean',
        '空调系统出水温度_°C': 'mean',
        '空调系统回水温度_°C': 'mean'
    }).reset_index()

    hourly['建筑编号'] = lake
    hourly['建筑类型'] = building_map.get(lake, '大学商业建筑')
    hourly['水耗_m3'] = np.nan
    hourly['人员密度'] = np.nan
    hourly['能耗监测设备编号'] = f'SHIFDR_{lake}_01'
    hourly['运行状态'] = '正常'
    hourly['电力能耗_kWh'] = np.nan

    all_data.append(hourly)

df = pd.concat(all_data, ignore_index=True)
df = df.sort_values(['建筑编号', '监测时间'])


df['空调系统能耗_kWh'] = df['空调系统能耗_kWh'].fillna(
    pd.Series(df['空调系统能耗_kWh'].mean() + np.random.normal(0, df['空调系统能耗_kWh'].std() * 0.1, len(df))))
df['环境温度_°C'] = df['环境温度_°C'].fillna(
    pd.Series(df['环境温度_°C'].mean() + np.random.normal(0, 2, len(df)))).clip(15, 25)
df['湿度_%RH'] = df['湿度_%RH'].fillna(pd.Series(df['湿度_%RH'].mean() + np.random.normal(0, 5, len(df)))).clip(30, 80)
df['空调系统出水温度_°C'] = df['空调系统出水温度_°C'].fillna(pd.Series(np.random.uniform(7, 12, len(df))))
df['空调系统回水温度_°C'] = df['空调系统回水温度_°C'].fillna(
    pd.Series(df['空调系统出水温度_°C'] + np.random.uniform(4.5, 8, len(df))))
df['电力能耗_kWh'] = df['电力能耗_kWh'].fillna(
    pd.Series(df['空调系统能耗_kWh'] * np.random.uniform(1.2, 1.5, len(df))).clip(60, 150))



def ode_func(y, t, T_interp, RH_interp, params):
    T = T_interp(t) if np.isscalar(t) else T_interp(t[0])
    RH = RH_interp(t) if np.isscalar(t) else RH_interp(t[0])
    C, R = params
    dy_dt = -y / (R * C) + (T - y) / R + 0.01 * RH + np.random.normal(0, 0.2)
    return dy_dt



final_df = pd.DataFrame()
for building, group in df.groupby('建筑编号'):
    group = group.sort_values('监测时间')
    t = ((group['监测时间'] - group['监测时间'].min()).dt.total_seconds() / 3600).values
    T = group['环境温度_°C'].values
    RH = group['湿度_%RH'].values
    y0 = group['空调系统能耗_kWh'].iloc[0] if not np.isnan(group['空调系统能耗_kWh'].iloc[0]) else group[
        '空调系统能耗_kWh'].mean()

    T_interp = interp1d(t, T, fill_value="extrapolate")
    RH_interp = interp1d(t, RH, fill_value="extrapolate")

    params = [np.random.uniform(0.4, 0.6), np.random.uniform(180, 220)]
    y_pred = odeint(ode_func, y0, t, args=(T_interp, RH_interp, params))

    group['空调系统能耗_kWh'] = np.clip(y_pred.flatten() + np.random.normal(0, 100, len(y_pred)), 100,
                                        5000)

    final_df = pd.concat([final_df, group])


last_time = final_df['监测时间'].max()
new_rows = []
current_time = last_time + timedelta(hours=1)

for i in range(ADD_ROWS):
    building = np.random.choice(final_df['建筑编号'].unique())
    b_type = building_map.get(building, '大学商业建筑')

    new_T = np.random.uniform(15, 25) + np.random.normal(0, 1.5)
    new_RH = np.random.uniform(30, 80) + np.random.normal(0, 7.5)
    new_T = np.clip(new_T, 15, 25)
    new_RH = np.clip(new_RH, 30, 80)

    new_y0 = final_df['空调系统能耗_kWh'].mean() + np.random.normal(0, 200)
    new_t = np.array([0.0])

    T_interp = lambda t: new_T
    RH_interp = lambda t: new_RH

    new_y = odeint(ode_func, new_y0, new_t,
                   args=(T_interp, RH_interp, [np.random.uniform(0.4, 0.6), np.random.uniform(180, 220)]))

    row = {
        '建筑编号': building,
        '建筑类型': b_type,
        '监测时间': current_time,
        '电力能耗_kWh': new_y[0][0] * np.random.uniform(1.2, 1.5),
        '水耗_m3': np.nan,
        '空调系统能耗_kWh': new_y[0][0],
        '空调系统出水温度_°C': np.random.uniform(7, 12),
        '空调系统回水温度_°C': np.random.uniform(11.5, 18),
        '环境温度_°C': new_T,
        '湿度_%RH': new_RH,
        '人员密度': np.nan,
        '能耗监测设备编号': f'SHIFDR_{building}_01',
        '运行状态': '异常' if np.random.random() < 0.1 else '正常'
    }
    new_rows.append(row)
    current_time += timedelta(hours=1)

new_df = pd.DataFrame(new_rows)
final_df = pd.concat([final_df, new_df], ignore_index=True)

final_df.to_csv(OUTPUT_FILE, index=False, encoding='utf-8-sig')

print(f"\n完成！")
print(f"文件保存: {OUTPUT_FILE}")
print(final_df.tail())
print("重复检查: 全数据重复行数 = {0}".format(len(final_df) - len(final_df.drop_duplicates())))