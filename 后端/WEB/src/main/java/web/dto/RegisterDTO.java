package web.dto;

import lombok.Data;

@Data
public class RegisterDTO {
    private String userName;
    private String password;
    /** 接收验证码的 QQ/邮箱 */
    private String email;
    /** 邮件中的 6 位验证码 */
    private String verificationCode;
}
