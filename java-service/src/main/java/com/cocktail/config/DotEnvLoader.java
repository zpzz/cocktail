package com.cocktail.config;

import java.io.BufferedReader;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * 启动前加载仓库根目录 {@code .env}，与 Python ai-service 共用同一套 POSTGRES_* 等变量。
 * <p>
 * 已存在的系统/环境变量优先，不会被 .env 覆盖。
 */
public final class DotEnvLoader {

    private DotEnvLoader() {
    }

    public static void load() {
        Path envFile = resolveEnvFile();
        if (envFile == null || !Files.isRegularFile(envFile)) {
            return;
        }
        try (BufferedReader reader = Files.newBufferedReader(envFile, StandardCharsets.UTF_8)) {
            String line;
            while ((line = reader.readLine()) != null) {
                line = line.trim();
                if (line.isEmpty() || line.startsWith("#")) {
                    continue;
                }
                int eq = line.indexOf('=');
                if (eq <= 0) {
                    continue;
                }
                String key = line.substring(0, eq).trim();
                String value = line.substring(eq + 1).trim();
                if ((value.startsWith("\"") && value.endsWith("\""))
                        || (value.startsWith("'") && value.endsWith("'"))) {
                    value = value.substring(1, value.length() - 1);
                }
                // 已有环境变量不覆盖（便于命令行临时改主机）
                if (System.getenv(key) == null && System.getProperty(key) == null) {
                    System.setProperty(key, value);
                }
            }
            System.out.println("[dotenv] loaded " + envFile.toAbsolutePath());
        } catch (IOException ex) {
            System.err.println("[dotenv] skip: " + ex.getMessage());
        }
    }

    private static Path resolveEnvFile() {
        // 从 java-service 目录启动：../.env；从仓库根启动：./.env
        Path cwd = Paths.get("").toAbsolutePath().normalize();
        Path candidate = cwd.resolve(".env");
        if (Files.isRegularFile(candidate)) {
            return candidate;
        }
        candidate = cwd.resolve("..").resolve(".env").normalize();
        if (Files.isRegularFile(candidate)) {
            return candidate;
        }
        return null;
    }
}
