package web.exception;

import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataAccessException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import web.dto.Result;

@Slf4j
@RestControllerAdvice // 核心注解：拦截所有 Controller 的异常
public class GlobalExceptionHandler {


    @ExceptionHandler(BaseException.class)
    public Result handleBaseException(BaseException e) {
        log.error("业务异常发生: {}", e.getMessage());
        return Result.fail(e.getMessageEnum());
    }

    @ExceptionHandler(Exception.class)
    public Result handleException(Exception e) {
        log.error("系统未知异常: ", e);
        String detail = e.getClass().getSimpleName() + ": " + e.getMessage();
        return Result.fail("未知错误 - " + detail);
    }

    @ExceptionHandler(DataAccessException.class)
    public Result handleDatabaseException(DataAccessException e) {
        log.error("数据库操作异常: ", e);
        return Result.fail("查询失败，请检查列名是否正确");
    }
}