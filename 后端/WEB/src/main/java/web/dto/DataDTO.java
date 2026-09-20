package web.dto;

import lombok.Data;

import java.util.List;

@Data
public class DataDTO {
    public List<String> columnNames;
    public List<String> cases;
}
