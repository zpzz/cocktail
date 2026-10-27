package com.cocktail.asset.api;

import java.io.IOException;
import java.nio.file.Path;
import java.util.Locale;

import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.cocktail.user.domain.UserAvatarStorage;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

/**
 * 静态图资源（杯型示意、品牌 logo、用户头像等），供小程序用网络 URL 加载。
 * <p>
 * 例：{@code GET /api/cocktail/assets/images/glasses/martini.jpg}
 */
@Tag(name = "静态资源")
@RestController
@RequestMapping("/api/cocktail/assets")
public class AssetController {

    private static final String CLASSPATH_ROOT = "static-assets/";

    private final UserAvatarStorage avatarStorage;

    public AssetController(UserAvatarStorage avatarStorage) {
        this.avatarStorage = avatarStorage;
    }

    @Operation(summary = "获取图片资源")
    @GetMapping("/images/{*path}")
    public ResponseEntity<Resource> image(@PathVariable("path") String path) throws IOException {
        String normalized = normalizePath(path);
        if (normalized == null) {
            return ResponseEntity.notFound().build();
        }

        Resource resource = new ClassPathResource(CLASSPATH_ROOT + "images/" + normalized);
        if (!resource.exists() || !resource.isReadable()) {
            return ResponseEntity.notFound().build();
        }

        return ResponseEntity.ok()
                .contentType(mediaTypeFor(normalized))
                .header(HttpHeaders.CACHE_CONTROL, "public, max-age=86400")
                .body(resource);
    }

    @Operation(summary = "获取用户头像")
    @GetMapping("/avatars/{filename}")
    public ResponseEntity<Resource> avatar(@PathVariable("filename") String filename) {
        Path file = avatarStorage.resolveFile(filename);
        if (file == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok()
                .contentType(mediaTypeFor(filename))
                .header(HttpHeaders.CACHE_CONTROL, "public, max-age=3600")
                .body(new FileSystemResource(file));
    }

    /** 拒绝 `..` 与绝对路径，只允许相对路径片段。 */
    private static String normalizePath(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        String path = raw.replace('\\', '/');
        while (path.startsWith("/")) {
            path = path.substring(1);
        }
        if (path.isBlank() || path.contains("..") || path.startsWith("/")) {
            return null;
        }
        return path;
    }

    private static MediaType mediaTypeFor(String path) {
        String lower = path.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".png")) {
            return MediaType.IMAGE_PNG;
        }
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
            return MediaType.IMAGE_JPEG;
        }
        if (lower.endsWith(".webp")) {
            return MediaType.parseMediaType("image/webp");
        }
        if (lower.endsWith(".gif")) {
            return MediaType.IMAGE_GIF;
        }
        return MediaType.APPLICATION_OCTET_STREAM;
    }
}
