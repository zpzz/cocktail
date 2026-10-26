package com.cocktail.cabinet.api;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

public final class CabinetDtos {

    private CabinetDtos() {
    }

    @Schema(description = "酒柜库存条目（列表/详情）")
    public record CabinetItemView(
            @Schema(description = "库存记录 ID") Long id,
            @Schema(description = "知识库材料 ID") Long ingredientId,
            @Schema(description = "材料中文名", example = "孟买蓝宝石金酒") String name,
            @Schema(description = "材料英文名/品牌", example = "Bombay Sapphire") String nameEn,
            @Schema(description = "一级分类", example = "基酒") String category,
            @Schema(description = "二级分类", example = "金酒") String subCategory,
            @Schema(description = "库存数量", example = "750") BigDecimal quantity,
            @Schema(description = "单位", example = "ml") String unit,
            @Schema(description = "是否已知余量；false 表示「余量未知」") boolean quantityKnown,
            @Schema(description = "库存状态：in_stock=有货，empty=无货", example = "in_stock") String stockStatus,
            @Schema(description = "材料图片 URL") String imageUrl,
            @Schema(description = "创建时间") Instant createdAt
    ) {
    }

    @Schema(description = "酒柜汇总")
    public record Summary(
            @Schema(description = "藏品总条数（当前用户）", example = "1") long itemCount
    ) {
    }

    @Schema(description = "酒柜列表响应")
    public record ListResponse(
            @Schema(description = "汇总信息") Summary summary,
            @Schema(description = "当前页库存列表") List<CabinetItemView> items,
            @Schema(description = "符合筛选条件的总条数") long total
    ) {
    }

    @Schema(description = "单条添加库存")
    public record AddItemRequest(
            @NotNull
            @Schema(description = "知识库材料 ID（必填，须已存在于 kb_ingredient）", requiredMode = Schema.RequiredMode.REQUIRED)
            Long ingredientId,
            @Schema(description = "数量；可不传", example = "750") BigDecimal quantity,
            @Schema(description = "单位；不传则用材料主单位", example = "ml") String unit,
            @Schema(description = "是否已知余量；默认 true", example = "true") Boolean quantityKnown
    ) {
    }

    @Schema(description = "批量添加库存请求")
    public record AddRequest(
            @Schema(description = "同材料已存在时是否合并：true=累加/更新，false=冲突返回 409；默认 true")
            Boolean merge,
            @NotEmpty @Valid
            @Schema(description = "要添加的材料列表", requiredMode = Schema.RequiredMode.REQUIRED)
            List<AddItemRequest> items
    ) {
    }

    @Schema(description = "更新库存请求")
    public record UpdateRequest(
            @Schema(description = "数量") BigDecimal quantity,
            @Schema(description = "单位") String unit,
            @Schema(description = "是否已知余量") Boolean quantityKnown
    ) {
    }

    @Schema(description = "用库存生成酒单请求")
    public record MenuRequest(
            @Schema(description = "推荐条数，默认 5", example = "5") Integer limit,
            @Schema(description = "是否尽量品类多样，默认 true", example = "true") Boolean diversity
    ) {
    }

    @Schema(description = "酒单配方中的一条材料用量")
    public record MenuIngredient(
            @Schema(description = "材料中文名") String name,
            @Schema(description = "材料英文名") String nameEn,
            @Schema(description = "用量") Double amount,
            @Schema(description = "单位") String unit
    ) {
    }

    @Schema(description = "酒单中的一条配方")
    public record MenuRecipe(
            @Schema(description = "配方 ID") Long recipeId,
            @Schema(description = "配方中文名") String name,
            @Schema(description = "配方英文名") String nameEn,
            @Schema(description = "品类/风格") String category,
            @Schema(description = "基酒") String baseSpirit,
            @Schema(description = "杯型") String glass,
            @Schema(description = "技法：shake/stir/build 等") String method,
            @Schema(description = "配图 URL") String imageUrl,
            @Schema(description = "匹配类型：full=全匹配，partial=有缺料") String matchType,
            @Schema(description = "缺少的材料名列表") List<String> missing,
            @Schema(description = "替代建议") List<String> substitutes,
            @Schema(description = "做法步骤") String instructions,
            @Schema(description = "材料用量列表") List<MenuIngredient> ingredients
    ) {
    }

    @Schema(description = "酒单生成元信息")
    public record MenuMeta(
            @Schema(description = "请求条数") int requested,
            @Schema(description = "实际返回条数") int returned,
            @Schema(description = "当前酒柜材料种数") long cabinetIngredientCount
    ) {
    }

    @Schema(description = "酒单生成响应")
    public record MenuResponse(
            @Schema(description = "推荐配方列表") List<MenuRecipe> recipes,
            @Schema(description = "元信息") MenuMeta meta,
            @Schema(description = "自动保存后的酒单 ID") Long savedMenuId
    ) {
    }

    @Schema(description = "识图匹配成功的材料")
    public record RecognizeMatched(
            @Schema(description = "知识库材料 ID") Long ingredientId,
            @Schema(description = "中文名") String name,
            @Schema(description = "英文名") String nameEn,
            @Schema(description = "一级分类") String category,
            @Schema(description = "二级分类") String subCategory,
            @Schema(description = "图片 URL") String imageUrl,
            @Schema(description = "识别置信度 0~1") Double confidence,
            @Schema(description = "是否已在当前用户酒柜中") boolean alreadyInCabinet
    ) {
    }

    @Schema(description = "识图未匹配项（库中无此材料，不可直接入库）")
    public record RecognizeUnmatched(
            @Schema(description = "识别出的原始标签") String rawLabel,
            @Schema(description = "原因，如 not_in_catalog") String reason
    ) {
    }

    @Schema(description = "拍照识别响应")
    public record RecognizeResponse(
            @Schema(description = "模糊匹配到的候选材料（多关键词合并去重），供用户勾选") List<RecognizeMatched> matched,
            @Schema(description = "未匹配项，仅提示") List<RecognizeUnmatched> unmatched,
            @Schema(description = "识别出的关键词/标签，便于前端展示") List<String> keywords
    ) {
    }
}
