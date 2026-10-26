package com.cocktail.custom.mapper;

import org.apache.ibatis.annotations.Mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cocktail.custom.domain.SavedCustom;

@Mapper
public interface SavedCustomMapper extends BaseMapper<SavedCustom> {
}
