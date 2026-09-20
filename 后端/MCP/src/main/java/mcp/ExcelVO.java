package mcp;

import lombok.Builder;
import lombok.Data;

import java.util.List;
import java.util.Map;

@Data
@Builder
public class ExcelVO {
    List<Map<String, Object>> data;
    String excelName;
}
