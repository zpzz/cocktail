package com.cocktail.custom.api;

import java.util.List;

import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.cocktail.custom.api.SavedCustomDtos.CustomDetail;
import com.cocktail.custom.api.SavedCustomDtos.CustomSummary;
import com.cocktail.custom.api.SavedCustomDtos.SaveCustomRequest;
import com.cocktail.custom.domain.SavedCustomService;
import com.cocktail.shared.web.ApiResponse;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

@Tag(name = "我的特调", description = "工作台生成的特调成品")
@RestController
@RequestMapping("/api/cocktail/customs")
public class SavedCustomController {

    private final SavedCustomService savedCustomService;

    public SavedCustomController(SavedCustomService savedCustomService) {
        this.savedCustomService = savedCustomService;
    }

    @Operation(summary = "我的特调列表")
    @GetMapping
    public ApiResponse<List<CustomSummary>> list() {
        return ApiResponse.ok(savedCustomService.listMine());
    }

    @Operation(summary = "特调详情")
    @GetMapping("/{id}")
    public ApiResponse<CustomDetail> detail(@PathVariable Long id) {
        return ApiResponse.ok(savedCustomService.getMine(id));
    }

    @Operation(summary = "保存特调")
    @PostMapping
    public ApiResponse<CustomDetail> save(@Valid @RequestBody SaveCustomRequest request) {
        return ApiResponse.ok(savedCustomService.save(request));
    }

    @Operation(summary = "删除特调")
    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@PathVariable Long id) {
        savedCustomService.deleteMine(id);
        return ApiResponse.ok();
    }
}
