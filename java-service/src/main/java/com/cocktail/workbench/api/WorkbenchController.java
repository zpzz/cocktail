package com.cocktail.workbench.api;

import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import com.cocktail.config.CocktailProperties;
import com.cocktail.shared.web.ApiResponse;
import com.cocktail.shared.web.SseSupport;
import com.cocktail.workbench.api.WorkbenchDtos.AnalyzeResponse;
import com.cocktail.workbench.api.WorkbenchDtos.GenerateRequest;
import com.cocktail.workbench.api.WorkbenchDtos.GlassesResponse;
import com.cocktail.workbench.api.WorkbenchDtos.OptionsResponse;
import com.cocktail.workbench.api.WorkbenchDtos.ResetRequest;
import com.cocktail.workbench.api.WorkbenchDtos.SessionPatch;
import com.cocktail.workbench.api.WorkbenchDtos.SessionView;
import com.cocktail.workbench.domain.WorkbenchCatalog;
import com.cocktail.workbench.domain.WorkbenchService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

/**
 * 调配工作台接口。
 * glasses / options 可匿名；sessions 相关需登录。
 * 生成接口用 SseEmitter，保证走 Servlet JWT 鉴权。
 */
@Tag(name = "调配工作台")
@RestController
@RequestMapping("/api/workbench")
public class WorkbenchController {

    private final WorkbenchService workbenchService;
    private final int maxIngredients;

    public WorkbenchController(WorkbenchService workbenchService, CocktailProperties properties) {
        this.workbenchService = workbenchService;
        this.maxIngredients = properties.workbench().maxIngredients();
    }

    @Operation(summary = "杯型列表")
    @GetMapping("/glasses")
    public ApiResponse<GlassesResponse> glasses() {
        return ApiResponse.ok(new GlassesResponse(WorkbenchCatalog.glasses()));
    }

    @Operation(summary = "技法/冰/装饰选项")
    @GetMapping("/options")
    public ApiResponse<OptionsResponse> options() {
        return ApiResponse.ok(WorkbenchCatalog.options(maxIngredients));
    }

    @SecurityRequirement(name = "bearerAuth")
    @Operation(summary = "创建调配会话")
    @PostMapping("/sessions")
    public ApiResponse<SessionView> create() {
        return ApiResponse.ok(workbenchService.create());
    }

    @SecurityRequirement(name = "bearerAuth")
    @Operation(summary = "查询会话")
    @GetMapping("/sessions/{sessionId}")
    public ApiResponse<SessionView> get(@PathVariable String sessionId) {
        return ApiResponse.ok(workbenchService.get(sessionId));
    }

    @SecurityRequirement(name = "bearerAuth")
    @Operation(summary = "更新会话（选杯/材料/技法等）")
    @PatchMapping("/sessions/{sessionId}")
    public ApiResponse<SessionView> patch(
            @PathVariable String sessionId,
            @Valid @RequestBody SessionPatch patch
    ) {
        return ApiResponse.ok(workbenchService.patch(sessionId, patch));
    }

    @SecurityRequirement(name = "bearerAuth")
    @Operation(summary = "重置会话")
    @PostMapping("/sessions/{sessionId}/reset")
    public ApiResponse<SessionView> reset(
            @PathVariable String sessionId,
            @RequestBody(required = false) ResetRequest request
    ) {
        return ApiResponse.ok(workbenchService.reset(sessionId, request));
    }

    @SecurityRequirement(name = "bearerAuth")
    @Operation(summary = "成杯可行性分析")
    @PostMapping("/sessions/{sessionId}/analyze")
    public ApiResponse<AnalyzeResponse> analyze(@PathVariable String sessionId) {
        return ApiResponse.ok(workbenchService.analyze(sessionId));
    }

    @SecurityRequirement(name = "bearerAuth")
    @Operation(summary = "生成特调（SSE）")
    @PostMapping(value = "/sessions/{sessionId}/generate", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter generate(
            @PathVariable String sessionId,
            @RequestBody(required = false) GenerateRequest request
    ) {
        return SseSupport.fromFlux(workbenchService.generate(sessionId, request));
    }
}
