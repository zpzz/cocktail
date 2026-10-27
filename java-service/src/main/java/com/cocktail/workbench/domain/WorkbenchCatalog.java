package com.cocktail.workbench.domain;

import java.util.List;
import java.util.Optional;

import com.cocktail.workbench.api.WorkbenchDtos.GlassItem;
import com.cocktail.workbench.api.WorkbenchDtos.IceItem;
import com.cocktail.workbench.api.WorkbenchDtos.Limits;
import com.cocktail.workbench.api.WorkbenchDtos.MethodItem;
import com.cocktail.workbench.api.WorkbenchDtos.OptionsResponse;
import com.cocktail.workbench.api.WorkbenchDtos.SimpleNamed;

/**
 * 杯型 / 技法 / 冰 / 装饰的静态目录（MVP 不建表）。
 * 后续可改成读配置或种子表。
 */
public final class WorkbenchCatalog {

    private static final String GLASS_IMAGE_PREFIX = "/api/cocktail/assets/images/glasses/";

    private static final List<GlassItem> GLASSES = List.of(
            new GlassItem("martini", "马提尼杯", "Martini", 150, glassImage("martini")),
            new GlassItem("highball", "高球杯", "Highball", 300, glassImage("highball")),
            new GlassItem("rocks", "古典杯", "Rocks", 250, glassImage("rocks")),
            new GlassItem("flute", "香槟杯", "Flute", 125, glassImage("flute")),
            new GlassItem("hurricane", "飓风杯", "Hurricane", 450, glassImage("hurricane")),
            new GlassItem("coupe", "碟形杯", "Coupe", 180, glassImage("coupe")),
            new GlassItem("nick_nora", "尼克诺拉杯", "Nick & Nora", 150, glassImage("nick_nora")),
            new GlassItem("wine_goblet", "葡萄酒杯", "Wine Goblet", 250, glassImage("wine_goblet")),
            new GlassItem("margarita", "玛格丽特杯", "Margarita", 300, glassImage("margarita"))
    );

    private static String glassImage(String code) {
        return GLASS_IMAGE_PREFIX + code + ".jpg";
    }

    private WorkbenchCatalog() {
    }

    public static List<GlassItem> glasses() {
        return GLASSES;
    }

    public static Optional<GlassItem> findGlass(String code) {
        return GLASSES.stream().filter(g -> g.code().equals(code)).findFirst();
    }

    public static OptionsResponse options(int maxIngredients) {
        return new OptionsResponse(
                List.of(
                        new MethodItem("build", "杯中直调", "Build"),
                        new MethodItem("stir", "搅拌", "Stir"),
                        new MethodItem("shake", "摇和", "Shake"),
                        new MethodItem("layer", "分层", "Layer")
                ),
                List.of(
                        new IceItem("none", "无冰"),
                        new IceItem("less", "少冰"),
                        new IceItem("standard", "标准冰"),
                        new IceItem("crushed", "碎冰"),
                        new IceItem("large", "大冰块")
                ),
                List.of(
                        new SimpleNamed("basil", "罗勒", null),
                        new SimpleNamed("lemon_twist", "柠檬皮卷", null),
                        new SimpleNamed("cocktail_cherry", "鸡尾酒樱桃", null),
                        new SimpleNamed("lime_wedge", "青柠角", null),
                        new SimpleNamed("orange_twist", "橙皮卷", null)
                ),
                new Limits(maxIngredients)
        );
    }
}
