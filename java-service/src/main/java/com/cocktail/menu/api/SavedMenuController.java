package com.cocktail.menu.api;

import java.util.List;

import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.cocktail.menu.api.SavedMenuDtos.SaveMenuRequest;
import com.cocktail.menu.api.SavedMenuDtos.SavedMenuDetail;
import com.cocktail.menu.api.SavedMenuDtos.SavedMenuSummary;
import com.cocktail.menu.domain.SavedMenuService;
import com.cocktail.shared.web.ApiResponse;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

@Tag(name = "我的酒单", description = "用库存生成的酒单会自动保存；此处可列表 / 详情 / 删除")
@RestController
@RequestMapping("/api/cocktail/menus")
public class SavedMenuController {

    private final SavedMenuService savedMenuService;

    public SavedMenuController(SavedMenuService savedMenuService) {
        this.savedMenuService = savedMenuService;
    }

    @Operation(summary = "我的酒单列表")
    @GetMapping
    public ApiResponse<List<SavedMenuSummary>> list() {
        return ApiResponse.ok(savedMenuService.listMine());
    }

    @Operation(summary = "酒单详情")
    @GetMapping("/{id}")
    public ApiResponse<SavedMenuDetail> detail(@PathVariable Long id) {
        return ApiResponse.ok(savedMenuService.getMine(id));
    }

    @Operation(summary = "手动保存酒单")
    @PostMapping
    public ApiResponse<SavedMenuDetail> save(@Valid @RequestBody SaveMenuRequest request) {
        return ApiResponse.ok(savedMenuService.save(request));
    }

    @Operation(summary = "删除酒单")
    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@PathVariable Long id) {
        savedMenuService.deleteMine(id);
        return ApiResponse.ok();
    }
}
