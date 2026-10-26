package com.cocktail.config;

import java.util.List;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.context.RequestAttributeSecurityContextRepository;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import com.cocktail.shared.security.JwtAuthenticationFilter;
import com.cocktail.shared.security.RestAuthEntryPoint;

/**
 * Spring Security：无 Session，全靠 JWT。
 * <p>
 * 白名单：健康检查、注册登录、材料/杯型等只读目录；其余接口需登录。
 * 鉴权失败也返回统一 {@code ApiResponse} JSON（见 {@link RestAuthEntryPoint}）。
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    PasswordEncoder passwordEncoder() {
        // 注册时加密密码、登录时比对
        return new BCryptPasswordEncoder();
    }

    @Bean
    SecurityFilterChain securityFilterChain(
            HttpSecurity http,
            JwtAuthenticationFilter jwtFilter,
            RestAuthEntryPoint restAuthEntryPoint
    ) throws Exception {
        http
                .csrf(AbstractHttpConfigurer::disable) // 前后端分离 + JWT，关 CSRF
                .cors(Customizer.withDefaults())
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                // 让 SecurityContext 挂在 request attribute 上，SSE 异步派发仍能读到登录态
                .securityContext(sc -> sc
                        .securityContextRepository(new RequestAttributeSecurityContextRepository()))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/actuator/health", "/actuator/info").permitAll()
                        // Swagger / OpenAPI
                        .requestMatchers(
                                "/swagger-ui.html",
                                "/swagger-ui/**",
                                "/v3/api-docs",
                                "/v3/api-docs/**",
                                "/swagger-ui/index.html",
                                "/swagger-auth.js"
                        ).permitAll()
                        .requestMatchers("/api/cocktail/auth/**").permitAll()
                        // 材料搜索、杯型/技法枚举：未登录也能浏览目录
                        .requestMatchers(HttpMethod.GET, "/api/cocktail/ingredients/**").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/cocktail/workbench/glasses", "/api/cocktail/workbench/options").permitAll()
                        .anyRequest().authenticated()
                )
                .exceptionHandling(ex -> ex
                        .authenticationEntryPoint(restAuthEntryPoint)
                        .accessDeniedHandler(restAuthEntryPoint)
                )
                // 在用户名密码过滤器之前解析 JWT
                .addFilterBefore(jwtFilter, UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }

    @Bean
    CorsConfigurationSource corsConfigurationSource() {
        // MVP 放开跨域，方便本地 RN / Web 调接口；生产应收紧域名
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOriginPatterns(List.of("*"));
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));
        config.setAllowCredentials(true);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }
}
