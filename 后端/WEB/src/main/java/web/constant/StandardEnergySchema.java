package web.constant;

import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 假定所有用户上传的 CSV 与标准能耗表 {@code final_guan} 使用相同表头（不含自增 id）。
 */
public final class StandardEnergySchema {

    private StandardEnergySchema() {
    }

    public static final String COL_TIME = "Time";
    public static final String COL_BUILDING_ID = "Building_ID";
    public static final String COL_BUILDING_TYPE = "Building_Type";
    public static final String COL_T_CORE = "T_core";
    public static final String COL_T_PERI = "T_peri";
    public static final String COL_T_ROOF = "T_roof";
    public static final String COL_T_AVG = "T_avg";
    public static final String COL_E_CORE = "E_core";
    public static final String COL_E_PERI = "E_peri";
    public static final String COL_E_ROOF = "E_roof";
    public static final String COL_E_TOTAL = "E_total";
    public static final String COL_TEXT = "Text";
    public static final String COL_GHI = "GHI";

    public static final Set<String> REQUIRED_CSV_HEADERS = Set.of(
            COL_TIME,
            COL_BUILDING_ID,
            COL_BUILDING_TYPE,
            COL_T_CORE,
            COL_T_PERI,
            COL_T_ROOF,
            COL_T_AVG,
            COL_E_CORE,
            COL_E_PERI,
            COL_E_ROOF,
            COL_E_TOTAL,
            COL_TEXT,
            COL_GHI
    );

    /**
     * 校验 CSV 表头是否与标准一致（忽略列顺序，大小写敏感）。
     */
    public static boolean isAllowedDataColumn(String columnName) {
        return columnName != null && REQUIRED_CSV_HEADERS.contains(columnName.trim());
    }

    public static void validateCsvHeaders(String[] headers) {
        if (headers == null || headers.length == 0) {
            throw new IllegalArgumentException("CSV 表头为空");
        }
        Set<String> actual = Arrays.stream(headers)
                .map(String::trim)
                .collect(Collectors.toSet());
        if (!actual.equals(REQUIRED_CSV_HEADERS)) {
            Set<String> missing = REQUIRED_CSV_HEADERS.stream()
                    .filter(h -> !actual.contains(h))
                    .collect(Collectors.toSet());
            Set<String> extra = actual.stream()
                    .filter(h -> !REQUIRED_CSV_HEADERS.contains(h))
                    .collect(Collectors.toSet());
            throw new IllegalArgumentException(
                    "表头与标准能耗模板不一致。缺少: " + missing + "，多余: " + extra
                            + "。要求列: " + REQUIRED_CSV_HEADERS);
        }
    }
}
