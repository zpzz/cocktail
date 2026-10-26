package com.cocktail.config;

import java.time.Duration;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.web.reactive.function.client.ExchangeStrategies;
import org.springframework.web.reactive.function.client.WebClient;

import reactor.netty.http.client.HttpClient;

/**
 * 调 Python AI 用的 WebClient。
 * <p>
 * 读超时放宽到 5 分钟：对话 / 生图是流式长连接。
 */
@Configuration
public class WebClientConfig {

    @Bean
    WebClient aiWebClient(CocktailProperties properties) {
        HttpClient httpClient = HttpClient.create()
                .responseTimeout(Duration.ofMinutes(5));

        return WebClient.builder()
                .baseUrl(properties.ai().baseUrl())
                .clientConnector(new ReactorClientHttpConnector(httpClient))
                // 识图等响应可能较大
                .exchangeStrategies(ExchangeStrategies.builder()
                        .codecs(c -> c.defaultCodecs().maxInMemorySize(16 * 1024 * 1024))
                        .build())
                .build();
    }
}
