package com.cocktail.chat.api;

import java.util.Map;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;

public final class ChatDtos {

    private ChatDtos() {
    }

    @Schema(description = "首页对话请求")
    public record ChatRequest(
            @Schema(description = "会话线程 ID；不传则服务端生成，追问时需带回")
            String threadId,
            @NotBlank
            @Schema(description = "用户输入", requiredMode = Schema.RequiredMode.REQUIRED, example = "清爽一点的短饮推荐")
            String userInput,
            @Schema(description = "是否附带当前酒柜快照给 AI", example = "true")
            Boolean attachCabinet,
            @Schema(description = "额外上下文，如 {\"mode\":\"home\"}")
            Map<String, Object> context
    ) {
    }

    @Schema(description = "追问续聊请求")
    public record ResumeRequest(
            @NotBlank
            @Schema(description = "与首轮相同的 threadId", requiredMode = Schema.RequiredMode.REQUIRED)
            String threadId,
            @NotBlank
            @Schema(description = "用户选择的选项或补充回答", requiredMode = Schema.RequiredMode.REQUIRED)
            String userInput
    ) {
    }
}
