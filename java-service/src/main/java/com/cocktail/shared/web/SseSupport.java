package com.cocktail.shared.web;

import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import reactor.core.publisher.Flux;

/**
 * 把 WebClient 的 {@link Flux} 接到 MVC {@link SseEmitter}。
 * <p>
 * 必须用 SseEmitter（Servlet），不能直接返回 Flux：同时引入 web + webflux 时，
 * Flux 会走 WebFlux 安全链，我们的 JWT 过滤器在 Servlet 链上，SSE 接口会一直 401。
 */
public final class SseSupport {

    private static final long TIMEOUT_MS = 5 * 60 * 1000L;

    private SseSupport() {
    }

    public static SseEmitter fromFlux(Flux<String> flux) {
        SseEmitter emitter = new SseEmitter(TIMEOUT_MS);
        flux.subscribe(
                data -> {
                    try {
                        emitter.send(SseEmitter.event().data(data));
                    } catch (Exception ex) {
                        emitter.completeWithError(ex);
                    }
                },
                emitter::completeWithError,
                emitter::complete
        );
        return emitter;
    }
}
