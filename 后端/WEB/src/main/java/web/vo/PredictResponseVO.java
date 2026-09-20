package web.vo;

import lombok.Data;

@Data
public class PredictResponseVO {
    private String timeLabel;    // 时间点 (如 "10:00")
    private double coreTemp;     // 核心区域预测温度
    private double periTemp;     // 外围区域预测温度
    private double roofTemp;     // 屋顶区域预测温度
}
