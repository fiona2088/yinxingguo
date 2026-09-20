package web.entity;

import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@Builder
public class SessionEntity {
    private String userName;
    private String tableName;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
