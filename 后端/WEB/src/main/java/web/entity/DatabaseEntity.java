package web.entity;

import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;

@Builder
@Data
public class DatabaseEntity {
    private String userName;
    private String name;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
    private String desc;
}
