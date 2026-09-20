package web.vo;

import lombok.Builder;
import lombok.Data;

import java.util.List;
import java.util.Map;

@Data
@Builder
public class DataVO {
    List<String> columnNames;
    List<Map<String, Object>> datas;

}
