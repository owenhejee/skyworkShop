package com.skyworkshop.common.exception;

import com.skyworkshop.common.enums.ErrorCode;
import lombok.Getter;

@Getter
public class BusinessException extends RuntimeException {

    private final int code;

    public BusinessException(ErrorCode errorCode) {
        super(errorCode.getMessage());
        this.code = errorCode.getCode();
    }

    public BusinessException(ErrorCode errorCode, Object... args) {
        super(errorCode.getMessage() + (args.length > 0 ? ": " + args[0] : ""));
        this.code = errorCode.getCode();
    }
}
