import pandas as pd
import numpy as np


df = pd.read_csv('SHIFDR_enhance_electricity.csv')


df['监测时间'] = pd.to_datetime(df['监测时间'])


df.set_index('监测时间', inplace=True)


df = df[~df.index.duplicated(keep='first')]


full_range = pd.date_range(start=df.index.min(), end=df.index.max(), freq='h')


df_resampled = df.reindex(full_range)


numeric_cols = df_resampled.select_dtypes(include=[np.number]).columns
df_resampled[numeric_cols] = df_resampled[numeric_cols].interpolate(method='linear')


non_numeric_cols = df_resampled.select_dtypes(exclude=[np.number]).columns
df_resampled[non_numeric_cols] = df_resampled[non_numeric_cols].ffill()


df_resampled.reset_index(inplace=True)
df_resampled.rename(columns={'index': '监测时间'}, inplace=True)


df_resampled.to_csv('SHIFDR_snnode_fixed.csv', index=False)


print(df_resampled[['监测时间', '电力能耗_kWh', '室内温度_°C']].head())