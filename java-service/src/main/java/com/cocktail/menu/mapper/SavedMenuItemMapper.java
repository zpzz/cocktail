package com.cocktail.menu.mapper;

import org.apache.ibatis.annotations.Mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cocktail.menu.domain.SavedMenuItem;

@Mapper
public interface SavedMenuItemMapper extends BaseMapper<SavedMenuItem> {
}
