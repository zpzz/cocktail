package com.cocktail.cabinet.api;

import java.util.List;

import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.cocktail.cabinet.api.CabinetDtos.AddRequest;
import com.cocktail.cabinet.api.CabinetDtos.CabinetItemView;
import com.cocktail.cabinet.api.CabinetDtos.ListResponse;
import com.cocktail.cabinet.api.CabinetDtos.MenuRequest;
import com.cocktail.cabinet.api.CabinetDtos.MenuResponse;
import com.cocktail.cabinet.api.CabinetDtos.RecognizeResponse;
import com.cocktail.cabinet.api.CabinetDtos.UpdateRequest;
import com.cocktail.cabinet.domain.CabinetService;
import com.cocktail.shared.web.ApiResponse;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

/** 酒柜 HTTP 入口，需登录。 */
@Tag(name = "酒柜", description = "我的库存 CRUD、拍照识别加料、按库存生成酒单")
@RestController
@RequestMapping("/api/cocktail/cabinet")
public class CabinetController {

    private final CabinetService cabinetService;

    public CabinetController(CabinetService cabinetService) {
        this.cabinetService = cabinetService;
    }

    @Operation(summary = "酒柜列表", description = "支持按名称模糊搜、一级/二级分类筛选；需登录")
    @GetMapping
    public ApiResponse<ListResponse> list(
            @Parameter(description = "关键词（品牌/名称/类别）") @RequestParam(required = false) String q,
            @Parameter(description = "一级分类，如：基酒") @RequestParam(required = false) String category,
            @Parameter(description = "二级分类，如：金酒；传「全部」或不传表示不限")
            @RequestParam(required = false) String subCategory,
            @Parameter(description = "页码，从 1 开始") @RequestParam(defaultValue = "1") int page,
            @Parameter(description = "每页条数") @RequestParam(defaultValue = "20") int size
    ) {
        return ApiResponse.ok(cabinetService.list(q, category, subCategory, page, size));
    }

    @Operation(summary = "添加库存", description = "可批量；材料必须来自知识库。merge 默认 true 表示同材料合并")
    @PostMapping
    public ApiResponse<List<CabinetItemView>> add(@Valid @RequestBody AddRequest request) {
        return ApiResponse.ok(cabinetService.add(request));
    }

    @Operation(summary = "更新库存")
    @PutMapping("/{id}")
    public ApiResponse<CabinetItemView> update(
            @Parameter(description = "库存记录 ID") @PathVariable Long id,
            @RequestBody UpdateRequest request
    ) {
        return ApiResponse.ok(cabinetService.update(id, request));
    }

    @Operation(summary = "删除库存")
    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(
            @Parameter(description = "库存记录 ID") @PathVariable Long id
    ) {
        cabinetService.delete(id);
        return ApiResponse.ok();
    }

    @Operation(summary = "拍照批量识别材料", description = "上传图片 → AI 识别 → 仅返回知识库中能匹配到的材料，勾选后再调「添加库存」")
    @PostMapping(value = "/recognize", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiResponse<RecognizeResponse> recognize(
            @Parameter(description = "酒瓶/材料照片") @RequestParam("file") MultipartFile file
    ) {
        return ApiResponse.ok(cabinetService.recognize(file));
    }

    @Operation(summary = "用库存生成酒单", description = "默认推荐 10 个配方，尽量品类多样；需 AI 服务可用")
    @PostMapping("/menu")
    public ApiResponse<MenuResponse> menu(@RequestBody(required = false) MenuRequest request) {
        return ApiResponse.ok(cabinetService.menu(request == null ? new MenuRequest(null, null) : request));
    }
}
