package web.enumeration;

import lombok.Getter;

@Getter // 使用 Lombok 自动生成 get 方法
public enum MessageEnum {

    IS_EMPTY(404, "用户名或密码为空"),
    CANT_BE_EMPTY(404, "不能为空"),
    UNAUTHORIZED(401, "未登录或登录已过期"),
    TOKEN_INVALID(401, "无效的访问令牌"),
    PASSWORD_ERROR(401, "密码错误"),
    ACCOUNT_NOT_FOUND(404, "账号不存在"),
    LOGIN_FAILED(400, "登录失败"),
    USER_ALREADY_EXISTS(409, "用户已存在"),
    EMAIL_ALREADY_REGISTERED(409, "该邮箱已被注册"),
    EMAIL_INVALID(400, "邮箱格式不正确"),
    EMAIL_CODE_INVALID(400, "验证码错误或已失效"),
    EMAIL_CODE_EXPIRED(400, "验证码已过期，请重新获取"),
    EMAIL_SEND_TOO_FREQUENT(429, "发送过于频繁，请稍后再试"),
    EMAIL_SEND_FAILED(500, "验证码邮件发送失败，请检查邮箱配置"),
    FILE_ILLEGAL(403, "文件不合法"),
    FILE_NOT_EXISTS(403, "文件不存在"),
    FILE_TOO_BIG(403, "文件过大"),
    FILE_ALREADY_EXISTS(403, "文件重名"),
    TABLE_NOT_SELECTED(400, "请先在数据库管理中选择一个数据集"),
    CSV_HEADER_INVALID(400, "CSV 表头与标准模板不一致"),
    UPLOAD_FAILED(500, "文件上传失败"),
    UNKNOWN_ERROR(500, "未知错误");

    private final int code;
    private final String message;

    MessageEnum(int code, String message) {
        this.code = code;
        this.message = message;
    }
}
