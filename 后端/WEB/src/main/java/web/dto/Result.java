package web.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import web.enumeration.MessageEnum;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class Result {
    private Integer code;     // 新增 code 字段
    private String msg;
    private Object data;
    private Long total;

    public static Result ok(String msg) {
        return new Result(200, msg, null, null);
    }

    public static Result ok(String msg, Object data, Long total) {
        return new Result(200, msg, data, total);
    }

    public static Result ok(String msg, Object data) {
        return new Result(200, msg, data, null);
    }

    public static Result fail(MessageEnum messageEnum) {
        return new Result(messageEnum.getCode(), messageEnum.getMessage(), null, null);
    }

    public static Result fail(String errorMsg) {
        return new Result(500, errorMsg, null, null);
    }
}