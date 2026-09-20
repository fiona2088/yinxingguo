package web.enumeration;

public enum ModelFeatureIndex {
    // 基础环境特征
    TEXT(0, "室外温度"),
    GHI(1, "太阳辐射"),

    // 区域能耗特征
    E_CORE(2, "核心区域能耗"),
    E_PERI(3, "外围区域能耗"),
    E_ROOF(4, "屋顶区域能耗"),

    // 初始温度参考值
    T_CORE_INIT(5, "核心区域温度初始值"),
    T_PERI_INIT(6, "外围区域温度初始值"),
    T_ROOF_INIT(7, "屋顶区域温度初始值"),

    // 时间归一化特征
    HOUR_NORM(8, "小时归一化"),
    MONTH_NORM(9, "月份归一化"),

    // 建筑类型 One-Hot 编码起始位 (10-17)
    TYPE_OFFICE_SMALL(10, "建筑类型:小型办公室"),
    TYPE_OFFICE_MEDIUM(11, "建筑类型:中型办公室"),
    TYPE_RESIDENTIAL(12, "建筑类型:住宅"),
    TYPE_SCHOOL(13, "建筑类型:学校"),
    TYPE_HOSPITAL(14, "建筑类型:医院"),
    TYPE_HOTEL(15, "建筑类型:酒店"),
    TYPE_SHOPPING_MALL(16, "建筑类型:购物中心"),
    TYPE_OTHER(17, "建筑类型:其他");

    private final int index;
    private final String description;

    ModelFeatureIndex(int index, String description) {
        this.index = index;
        this.description = description;
    }

    public int getIndex() { return index; }
}
