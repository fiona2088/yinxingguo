import pandas as pd
import numpy as np


df = pd.read_csv('D:\SHIFDR\SHIFDR_with_GUI.csv')  # Replace with your file path


def adjust_power_consumption(row, min_value=60.0, max_value=2500.0):

    if row['电力能耗_kWh'] == 60.0:

        new_value = np.random.uniform(min_value + 0.1, max_value)
        return new_value
    else:
        return row['电力能耗_kWh']


df['电力能耗_kWh'] = df.apply(adjust_power_consumption, axis=1)


df.to_csv('D:\SHIFDR\SHIFDR_enhance_electricity.csv', index=False)

print(df[['监测时间', '电力能耗_kWh']].head())