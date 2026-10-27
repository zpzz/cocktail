package com.cocktail.chat.client;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.core.ParameterizedTypeReference;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.client.MultipartBodyBuilder;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.reactive.function.BodyInserters;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;

import com.cocktail.cabinet.api.CabinetDtos.MenuRecipe;
import com.cocktail.config.CocktailProperties;
import com.cocktail.shared.exception.BusinessException;

import reactor.core.publisher.Flux;

/**
 * 调用 Python AI 服务的唯一出口。
 * <p>
 * APP 不直连 Python；业务 Service 组好参数后走这里。
 * 流式接口返回 {@link Flux}，由 Controller 转成 SSE；同步接口用 {@code block()}。
 */
@Component
public class AiServiceClient {

    private final WebClient webClient;
    private final CocktailProperties.Ai ai;

    public AiServiceClient(WebClient aiWebClient, CocktailProperties properties) {
        this.webClient = aiWebClient;
        this.ai = properties.ai();
    }

    /** 首页对话 SSE（对外契约 thread_id/user_input → Python session_id/message） */
    public Flux<String> streamChat(Map<String, Object> body) {
        return stream(ai.chatPath(), toPythonChatBody(body));
    }

    /** 追问续聊 SSE */
    public Flux<String> streamResume(Map<String, Object> body) {
        return stream(ai.resumePath(), toPythonChatBody(body));
    }

    /** 适配当前 Python /api/ai/chat/stream 入参 */
    private static Map<String, Object> toPythonChatBody(Map<String, Object> body) {
        Map<String, Object> python = new HashMap<>();
        Object threadId = body.get("thread_id");
        Object userInput = body.get("user_input");
        python.put("session_id", threadId == null || String.valueOf(threadId).isBlank()
                ? "default"
                : String.valueOf(threadId));
        python.put("message", userInput == null ? "" : String.valueOf(userInput));
        return python;
    }

    /** 工作台生成特调 SSE */
    public Flux<String> streamWorkbenchGenerate(Map<String, Object> body) {
        return stream(ai.workbenchGeneratePath(), body);
    }

    /** 工作台成杯可行性（JSON，非流式） */
    @SuppressWarnings("unchecked")
    public Map<String, Object> workbenchAnalyze(Map<String, Object> body) {
        try {
            Map<String, Object> response = webClient.post()
                    .uri(ai.workbenchAnalyzePath())
                    .contentType(MediaType.APPLICATION_JSON)
                    .bodyValue(body)
                    .retrieve()
                    .bodyToMono(new ParameterizedTypeReference<Map<String, Object>>() {
                    })
                    .block();
            return response == null ? Map.of() : response;
        } catch (WebClientResponseException ex) {
            throw wrap(ex, "AI 可行性分析失败");
        } catch (Exception ex) {
            throw new BusinessException("AI_UNAVAILABLE", "AI 服务不可用: " + ex.getMessage(), HttpStatus.BAD_GATEWAY);
        }
    }

    /** 知识库配方风味补全（摘要 / 口感 / 难度 / 六维画像） */
    public Map<String, Object> recipeEnrich(Map<String, Object> body) {
        try {
            Map<String, Object> response = webClient.post()
                    .uri(ai.recipeEnrichPath())
                    .contentType(MediaType.APPLICATION_JSON)
                    .bodyValue(body)
                    .retrieve()
                    .bodyToMono(new ParameterizedTypeReference<Map<String, Object>>() {
                    })
                    .block();
            return response == null ? Map.of() : response;
        } catch (WebClientResponseException ex) {
            throw wrap(ex, "AI 风味补全失败");
        } catch (Exception ex) {
            throw new BusinessException("AI_UNAVAILABLE", "AI 服务不可用: " + ex.getMessage(), HttpStatus.BAD_GATEWAY);
        }
    }

    /**
     * 上传酒瓶图，Python 返回 labels；Java 再去 kb_ingredient 匹配。
     * Python 未就绪时会抛 AI_UNAVAILABLE。
     */
    public List<Map<String, Object>> recognizeIngredients(MultipartFile file) {
        try {
            MultipartBodyBuilder builder = new MultipartBodyBuilder();
            builder.part("file", new ByteArrayResource(file.getBytes()) {
                @Override
                public String getFilename() {
                    return file.getOriginalFilename() == null ? "upload.jpg" : file.getOriginalFilename();
                }
            }).contentType(MediaType.parseMediaType(
                    file.getContentType() == null ? MediaType.APPLICATION_OCTET_STREAM_VALUE : file.getContentType()
            ));

            Map<String, Object> response = webClient.post()
                    .uri(ai.recognizePath())
                    .contentType(MediaType.MULTIPART_FORM_DATA)
                    .body(BodyInserters.fromMultipartData(builder.build()))
                    .retrieve()
                    .bodyToMono(new ParameterizedTypeReference<Map<String, Object>>() {
                    })
                    .block();

            if (response == null || response.get("labels") == null) {
                return List.of();
            }
            Object labels = response.get("labels");
            if (labels instanceof List<?> list) {
                return list.stream()
                        .filter(Map.class::isInstance)
                        .map(item -> (Map<String, Object>) item)
                        .toList();
            }
            return List.of();
        } catch (WebClientResponseException ex) {
            throw wrap(ex, "材料识别失败");
        } catch (Exception ex) {
            throw new BusinessException("AI_UNAVAILABLE", "AI 服务不可用: " + ex.getMessage(), HttpStatus.BAD_GATEWAY);
        }
    }

    /** 按酒柜快照生成酒单，默认 5 条、diversity 尽量品类分散。 */
    public List<MenuRecipe> cabinetMenu(List<Map<String, Object>> snapshot, int limit, boolean diversity) {
        Map<String, Object> body = new HashMap<>();
        body.put("cabinet_snapshot", snapshot);
        body.put("limit", limit);
        body.put("diversity", diversity);
        try {
            Map<String, Object> response = webClient.post()
                    .uri(ai.cabinetMenuPath())
                    .contentType(MediaType.APPLICATION_JSON)
                    .bodyValue(body)
                    .retrieve()
                    .bodyToMono(new ParameterizedTypeReference<Map<String, Object>>() {
                    })
                    .block();
            if (response == null || response.get("recipes") == null) {
                return List.of();
            }
            Object recipes = response.get("recipes");
            if (!(recipes instanceof List<?> list)) {
                return List.of();
            }
            return list.stream()
                    .filter(Map.class::isInstance)
                    .map(item -> toMenuRecipe((Map<String, Object>) item))
                    .toList();
        } catch (WebClientResponseException ex) {
            throw wrap(ex, "酒单生成失败");
        } catch (Exception ex) {
            throw new BusinessException("AI_UNAVAILABLE", "AI 服务不可用: " + ex.getMessage(), HttpStatus.BAD_GATEWAY);
        }
    }

    /** 通用 SSE：接受 text/event-stream，按行/块转成字符串流。 */
    private Flux<String> stream(String path, Map<String, Object> body) {
        return webClient.post()
                .uri(path)
                .contentType(MediaType.APPLICATION_JSON)
                .accept(MediaType.TEXT_EVENT_STREAM)
                .bodyValue(body)
                .retrieve()
                .bodyToFlux(String.class)
                .onErrorMap(WebClientResponseException.class, ex -> wrap(ex, "AI 流式调用失败"))
                .onErrorMap(ex -> !(ex instanceof BusinessException),
                        ex -> new BusinessException("AI_UNAVAILABLE", "AI 服务不可用: " + ex.getMessage(), HttpStatus.BAD_GATEWAY));
    }

    private static MenuRecipe toMenuRecipe(Map<String, Object> map) {
        return new MenuRecipe(
                asLong(map.get("recipe_id") != null ? map.get("recipe_id") : map.get("recipeId")),
                stringVal(map.get("name")),
                stringVal(map.get("name_en") != null ? map.get("name_en") : map.get("nameEn")),
                stringVal(map.get("category")),
                stringVal(map.get("base_spirit") != null ? map.get("base_spirit") : map.get("baseSpirit")),
                stringVal(map.get("glass")),
                stringVal(map.get("method")),
                stringVal(map.get("image_url") != null ? map.get("image_url") : map.get("imageUrl")),
                stringVal(map.get("match_type") != null ? map.get("match_type") : map.get("matchType")),
                asStringList(map.get("missing")),
                asStringList(map.get("substitutes")),
                stringVal(map.get("instructions")),
                asIngredients(map.get("ingredients"))
        );
    }

    private static List<String> asStringList(Object value) {
        if (!(value instanceof List<?> list)) {
            return Collections.emptyList();
        }
        return list.stream().map(String::valueOf).toList();
    }

    private static List<com.cocktail.cabinet.api.CabinetDtos.MenuIngredient> asIngredients(Object value) {
        if (!(value instanceof List<?> list)) {
            return Collections.emptyList();
        }
        List<com.cocktail.cabinet.api.CabinetDtos.MenuIngredient> out = new ArrayList<>();
        for (Object item : list) {
            if (!(item instanceof Map<?, ?> raw)) {
                continue;
            }
            @SuppressWarnings("unchecked")
            Map<String, Object> row = (Map<String, Object>) raw;
            Double amount = null;
            Object amountObj = row.get("amount");
            if (amountObj instanceof Number n) {
                amount = n.doubleValue();
            }
            out.add(new com.cocktail.cabinet.api.CabinetDtos.MenuIngredient(
                    stringVal(row.get("name")),
                    stringVal(row.get("name_en") != null ? row.get("name_en") : row.get("nameEn")),
                    amount,
                    stringVal(row.get("unit"))
            ));
        }
        return out;
    }

    private static Long asLong(Object value) {
        if (value instanceof Number n) {
            return n.longValue();
        }
        if (value == null) {
            return null;
        }
        try {
            return Long.valueOf(String.valueOf(value));
        } catch (NumberFormatException ex) {
            return null;
        }
    }

    private static String stringVal(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    private static BusinessException wrap(WebClientResponseException ex, String prefix) {
        return new BusinessException(
                "AI_ERROR",
                prefix + ": " + ex.getStatusCode().value() + " " + ex.getResponseBodyAsString(),
                HttpStatus.BAD_GATEWAY
        );
    }
}
