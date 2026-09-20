import pandas as pd
import numpy as np

df = pd.read_csv('D:\SHIFDR\SHIFDR_with_indoor_temp_final.csv')

def generate_solar_radiation(row):

    hour = pd.to_datetime(row['监测时间']).hour
    month = pd.to_datetime(row['监测时间']).month


    base_solar_radiation = 200

    if 6 <= hour <= 18:
        solar_radiation = base_solar_radiation * (1 + 0.3 * np.sin(np.pi * (hour - 6) / 12))
    else:
        solar_radiation = base_solar_radiation * 0.1


    season_factor = 1 + 0.1 * np.sin(np.pi * (month - 1) / 6)
    solar_radiation *= season_factor

    solar_radiation *= (1 + 0.02 * (row['环境温度_°C'] - 20))


    noise = np.random.uniform(-10, 10)
    solar_radiation += noise


    return max(0, min(solar_radiation, 1000))


df['GUI'] = df.apply(generate_solar_radiation, axis=1)


df.to_csv('D:\SHIFDR\SHIFDR_with_GUI.csv', index=False)


print(df[['监测时间', '环境温度_°C', '室内温度_°C', 'GUI']].head())