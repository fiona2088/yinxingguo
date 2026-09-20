package web.entity;

import lombok.Builder;
import lombok.Data;

import java.util.List;

@Data
@Builder
public class DataEntity {
    public List<String> columnNames;
    public List<String> cases;
    public List<String> datas;
}
