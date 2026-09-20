package web.dto;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class BuildingFeatureDTO {
    private double text;        // 0. 室外温度
    private double ghi;         // 1. 太阳辐射
    private double eCore;       // 2. 核心区能耗
    private double ePeri;       // 3. 外围区能耗
    private double eRoof;       // 4. 屋顶区能耗
    private double tCoreInit;   // 5. 核心区温度初始值
    private double tPeriInit;   // 6. 外围区温度初始值
    private double tRoofInit;   // 7. 屋顶区温度初始值
    private double hourNorm;    // 8. 小时归一化 (hour/24)
    private double monthNorm;   // 9. 月份归一化 ((month-1)/11)
    private double[] typeOneHot; // 10-17. 建筑类型 (长度为8的数组)

    public double[] toArray() {
        double[] feature = new double[18];
        feature[0] = text; feature[1] = ghi;
        feature[2] = eCore; feature[3] = ePeri; feature[4] = eRoof;
        feature[5] = tCoreInit; feature[6] = tPeriInit; feature[7] = tRoofInit;
        feature[8] = hourNorm; feature[9] = monthNorm;
        System.arraycopy(typeOneHot, 0, feature, 10, 8);
        return feature;
    }
}
