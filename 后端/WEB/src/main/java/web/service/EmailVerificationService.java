package web.service;

public interface EmailVerificationService {

    /**
     * 向邮箱发送 6 位注册验证码（存入 Redis，有效期 5 分钟）
     */
    void sendRegisterCode(String email);

    /**
     * 校验验证码（通过后删除，一次性使用）
     */
    void verifyRegisterCode(String email, String code);
}
