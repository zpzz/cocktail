package com.cocktail.chat.api;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import com.cocktail.cabinet.domain.CabinetService;
import com.cocktail.chat.api.ChatDtos.ChatRequest;
import com.cocktail.chat.api.ChatDtos.ResumeRequest;
import com.cocktail.chat.client.AiServiceClient;
import com.cocktail.shared.web.SseSupport;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

/**
 * 首页 AI 对话代理（SSE）。
 * <p>
 * 使用 {@link SseEmitter} 走 Servlet 安全链，JWT / Cookie 才能生效。
 */
@Tag(name = "AI 对话", description = "需登录。先 POST /api/cocktail/auth/login，再调本接口；或右上角 Authorize 填 accessToken")
@SecurityRequirement(name = "bearerAuth")
@SecurityRequirement(name = "cookieAuth")
@RestController
@RequestMapping("/api/cocktail/chat")
public class ChatController {

    private final AiServiceClient aiServiceClient;
    private final CabinetService cabinetService;

    public ChatController(AiServiceClient aiServiceClient, CabinetService cabinetService) {
        this.aiServiceClient = aiServiceClient;
        this.cabinetService = cabinetService;
    }

    @Operation(summary = "流式对话", description = "需 JWT。threadId 可留空；context 可删掉示例 additionalProp")
    @PostMapping(produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter chat(@Valid @RequestBody ChatRequest request) {
        String threadId = request.threadId() == null || request.threadId().isBlank()
                ? UUID.randomUUID().toString()
                : request.threadId().trim();

        Map<String, Object> body = new HashMap<>();
        body.put("thread_id", threadId);
        body.put("user_input", request.userInput().trim());
        if (request.context() != null && !request.context().isEmpty()) {
            body.put("context", request.context());
        }
        if (Boolean.TRUE.equals(request.attachCabinet())) {
            body.put("cabinet_snapshot", cabinetService.snapshotForCurrentUser());
        }

        return SseSupport.fromFlux(aiServiceClient.streamChat(body));
    }

    @Operation(summary = "追问续聊", description = "同一 threadId；需登录")
    @PostMapping(value = "/resume", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter resume(@Valid @RequestBody ResumeRequest request) {
        Map<String, Object> body = new HashMap<>();
        body.put("thread_id", request.threadId().trim());
        body.put("user_input", request.userInput().trim());
        return SseSupport.fromFlux(aiServiceClient.streamResume(body));
    }
}
