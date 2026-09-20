package web.exception;

import lombok.Getter;
import web.enumeration.MessageEnum;

@Getter
public class BaseException extends RuntimeException {
    private final MessageEnum messageEnum;

    public BaseException(MessageEnum messageEnum) {
        super(messageEnum.getMessage()); // 把错误信息传给父类
        this.messageEnum = messageEnum;
    }
}