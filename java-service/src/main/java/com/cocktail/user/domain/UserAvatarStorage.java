package com.cocktail.user.domain;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Locale;
import java.util.Set;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import com.cocktail.config.CocktailProperties;
import com.cocktail.shared.exception.BusinessException;

/** 用户头像存本地目录，经 `/api/cocktail/assets/avatars/{file}` 对外访问。 */
@Component
public class UserAvatarStorage {

    private static final Set<String> ALLOWED_EXT = Set.of("png", "jpg", "jpeg", "webp");

    private final Path rootDir;

    public UserAvatarStorage(CocktailProperties properties) {
        String configured = properties.avatarDir();
        this.rootDir = Paths.get(
                StringUtils.hasText(configured) ? configured : "./data/avatars"
        ).toAbsolutePath().normalize();
    }

    public Path rootDir() {
        return rootDir;
    }

    /**
     * 保存头像，返回可公开访问的相对路径（如 {@code /api/cocktail/assets/avatars/12.jpg}）。
     */
    public String store(Long userId, MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new BusinessException("INVALID_AVATAR", "头像文件为空", HttpStatus.BAD_REQUEST);
        }
        String ext = extensionOf(file.getOriginalFilename(), file.getContentType());
        if (!ALLOWED_EXT.contains(ext)) {
            throw new BusinessException("INVALID_AVATAR", "仅支持 png/jpg/webp", HttpStatus.BAD_REQUEST);
        }
        try {
            Files.createDirectories(rootDir);
            Path target = rootDir.resolve(userId + "." + ext);
            // 清掉同用户其它后缀的旧文件
            try (var stream = Files.list(rootDir)) {
                stream.filter(p -> p.getFileName().toString().startsWith(userId + "."))
                        .forEach(p -> {
                            try {
                                Files.deleteIfExists(p);
                            } catch (IOException ignored) {
                                // best-effort
                            }
                        });
            }
            file.transferTo(target);
            return "/api/cocktail/assets/avatars/" + userId + "." + ext;
        } catch (IOException ex) {
            throw new BusinessException("AVATAR_SAVE_FAILED", "头像保存失败", HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    public Path resolveFile(String filename) {
        if (!StringUtils.hasText(filename) || filename.contains("..") || filename.contains("/") || filename.contains("\\")) {
            return null;
        }
        Path file = rootDir.resolve(filename).normalize();
        if (!file.startsWith(rootDir) || !Files.isRegularFile(file)) {
            return null;
        }
        return file;
    }

    private static String extensionOf(String filename, String contentType) {
        if (StringUtils.hasText(filename) && filename.contains(".")) {
            String ext = filename.substring(filename.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT);
            if (ALLOWED_EXT.contains(ext)) {
                return ext.equals("jpeg") ? "jpg" : ext;
            }
        }
        if (contentType != null) {
            String ct = contentType.toLowerCase(Locale.ROOT);
            if (ct.contains("png")) {
                return "png";
            }
            if (ct.contains("webp")) {
                return "webp";
            }
            if (ct.contains("jpeg") || ct.contains("jpg")) {
                return "jpg";
            }
        }
        return "jpg";
    }
}
