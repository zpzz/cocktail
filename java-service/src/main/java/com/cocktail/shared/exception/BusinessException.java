package com.cocktail.shared.exception;

import org.springframework.http.HttpStatus;

/**
 * 可预期的业务错误（用户名占用、库存不存在等）。
 * <p>
 * 抛出后由 {@link GlobalExceptionHandler} 转成统一 {@code ApiResponse}，并带上 HTTP 状态码。
 */
public class BusinessException extends RuntimeException {

    /** 机器可读错误码，如 USERNAME_TAKEN */
    private final String code;
    private final HttpStatus status;

    public BusinessException(String code, String message) {
        this(code, message, HttpStatus.BAD_REQUEST);
    }

    public BusinessException(String code, String message, HttpStatus status) {
        super(message);
        this.code = code;
        this.status = status;
    }

    public String getCode() {
        return code;
    }

    public HttpStatus getStatus() {
        return status;
    }
}
