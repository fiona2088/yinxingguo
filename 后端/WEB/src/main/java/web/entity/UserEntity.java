package web.entity;

import lombok.Builder;
import lombok.Data;

@Builder
@Data
public class UserEntity {
    private int id;
    private String userName;
    private String password;
    private String email;

}
