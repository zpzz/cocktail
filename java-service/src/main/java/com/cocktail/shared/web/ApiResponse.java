package com.cocktail.shared.web;

import org.springframework.http.HttpStatus;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 统一 JSON 外壳：
 * {@code { success, status, code, message, data }}
 */
@Schema(description = "统一接口响应")
public record ApiResponse<T>(
        @Schema(description = "是否成功", example = "true")
        boolean success,
        @Schema(description = "数字状态码（与 HTTP Status 一致）", example = "200")
        int status,
        @Schema(description = "业务码：OK / UNAUTHORIZED / CABINET_EMPTY 等", example = "OK")
        String code,
        @Schema(description = "提示文案；成功时多为 null")
        String message,
        @Schema(description = "业务数据；失败时为 null")
        T data
) {
    public static <T> ApiResponse<T> ok(T data) {
        return new ApiResponse<>(true, HttpStatus.OK.value(), "OK", null, data);
    }

    public static <T> ApiResponse<T> ok() {
        return new ApiResponse<>(true, HttpStatus.OK.value(), "OK", null, null);
    }

    public static <T> ApiResponse<T> fail(HttpStatus httpStatus, String code, String message) {
        return new ApiResponse<>(false, httpStatus.value(), code, message, null);
    }

    /** 默认 400 */
    public static <T> ApiResponse<T> fail(String code, String message) {
        return fail(HttpStatus.BAD_REQUEST, code, message);
    }
}
