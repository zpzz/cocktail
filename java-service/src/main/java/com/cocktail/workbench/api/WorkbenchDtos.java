package com.cocktail.workbench.api;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

public final class WorkbenchDtos {

    private WorkbenchDtos() {
    }

    @Schema(description = "杯型")
    public record GlassItem(
            @Schema(description = "杯型编码", example = "flute") String code,
            @Schema(description = "中文名", example = "香槟杯") String name,
            @Schema(description = "英文名", example = "Flute") String nameEn,
            @Schema(description = "容量（毫升）", example = "125") int capacityMl,
            @Schema(description = "示意图 URL") String imageUrl
    ) {
    }

    @Schema(description = "杯型列表响应")
    public record GlassesResponse(
            @Schema(description = "杯型列表") List<GlassItem> items
    ) {
    }

    @Schema(description = "调制技法")
    public record MethodItem(
            @Schema(description = "编码", example = "shake") String code,
            @Schema(description = "中文名", example = "摇和") String name,
            @Schema(description = "英文名", example = "Shake") String nameEn
    ) {
    }

    @Schema(description = "冰型")
    public record IceItem(
            @Schema(description = "编码", example = "standard") String code,
            @Schema(description = "中文名", example = "标准冰") String name
    ) {
    }

    @Schema(description = "装饰选项")
    public record SimpleNamed(
            @Schema(description = "编码") String code,
            @Schema(description = "中文名") String name,
            @Schema(description = "图片 URL") String imageUrl
    ) {
    }

    @Schema(description = "工作台限制")
    public record Limits(
            @Schema(description = "单局最多材料数", example = "12") int maxIngredients
    ) {
    }

    @Schema(description = "技法/冰/装饰等选项")
    public record OptionsResponse(
            @Schema(description = "技法列表") List<MethodItem> methods,
            @Schema(description = "冰型列表") List<IceItem> iceTypes,
            @Schema(description = "装饰列表") List<SimpleNamed> garnishes,
            @Schema(description = "限制") Limits limits
    ) {
    }

    @Schema(description = "当前选中的杯")
    public record GlassView(
            @Schema(description = "杯型编码") String code,
            @Schema(description = "中文名") String name,
            @Schema(description = "英文名") String nameEn,
            @Schema(description = "容量 ml") int capacityMl,
            @Schema(description = "图片 URL") String imageUrl
    ) {
    }

    @Schema(description = "已选材料一行")
    public record IngredientLine(
            @Schema(description = "材料 ID") Long ingredientId,
            @Schema(description = "材料名") String name,
            @Schema(description = "用量") BigDecimal amount,
            @Schema(description = "单位") String unit,
            @Schema(description = "材料图片 URL") String imageUrl
    ) {
    }

    @Schema(description = "工作台会话快照（完整状态）")
    public record SessionView(
            @Schema(description = "会话 UUID（对外）") String sessionId,
            @Schema(description = "状态：draft / generated / abandoned") String status,
            @Schema(description = "已选杯；未选为 null") GlassView glass,
            @Schema(description = "已选材料") List<IngredientLine> ingredients,
            @Schema(description = "技法编码") String method,
            @Schema(description = "冰型编码") String iceType,
            @Schema(description = "装饰编码列表") List<String> garnishes,
            @Schema(description = "想要的感觉（可选文案）") String feeling,
            @Schema(description = "当前已选材料用量合计 ml") BigDecimal volumeMl,
            @Schema(description = "杯容量 ml") Integer capacityMl,
            @Schema(description = "剩余可用容量 ml") BigDecimal remainingMl,
            @Schema(description = "已选材料种数") int ingredientCount,
            @Schema(description = "材料种数上限") int maxIngredients
    ) {
    }

    @Schema(description = "更新材料时的一行")
    public record IngredientPatch(
            @NotNull @Schema(description = "材料 ID", requiredMode = Schema.RequiredMode.REQUIRED) Long ingredientId,
            @NotNull @Schema(description = "用量", requiredMode = Schema.RequiredMode.REQUIRED) BigDecimal amount,
            @Schema(description = "单位") String unit
    ) {
    }

    @Schema(description = "更新会话（只传要改的字段）")
    public record SessionPatch(
            @Schema(description = "杯型编码") String glassCode,
            @Valid @Schema(description = "材料列表（全量覆盖）") List<IngredientPatch> ingredients,
            @Schema(description = "技法") String method,
            @Schema(description = "冰型") String iceType,
            @Schema(description = "装饰编码列表") List<String> garnishes,
            @Schema(description = "感觉文案") String feeling
    ) {
    }

    @Schema(description = "重置会话")
    public record ResetRequest(
            @Schema(description = "是否保留已选杯", example = "true") Boolean keepGlass
    ) {
    }

    @Schema(description = "生成特调请求")
    public record GenerateRequest(
            @Schema(description = "可覆盖会话里的感觉文案") String feeling
    ) {
    }

    @Schema(description = "风味雷达六维（0~1）")
    public record FlavorProfile(
            @Schema(description = "甜度") Double sweetness,
            @Schema(description = "酒精感") Double alcohol,
            @Schema(description = "酸度") Double sourness,
            @Schema(description = "香气") Double aroma,
            @Schema(description = "能量") Double energy,
            @Schema(description = "难度") Double difficulty
    ) {
    }

    @Schema(description = "成杯可行性分析结果")
    public record AnalyzeResponse(
            @Schema(description = "是否可行") Boolean feasible,
            @Schema(description = "风味摘要") String flavorSummary,
            @Schema(description = "风味雷达六维") FlavorProfile flavorProfile,
            @Schema(description = "冲突提示列表") List<Map<String, Object>> conflicts,
            @Schema(description = "建议") List<String> suggestions
    ) {
    }
}
