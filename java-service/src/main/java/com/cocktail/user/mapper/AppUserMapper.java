package com.cocktail.user.mapper;

import org.apache.ibatis.annotations.Mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cocktail.user.domain.AppUser;

/** MyBatis-Plus：app_user 表 CRUD，复杂条件在 Service 里用 LambdaQueryWrapper。 */
@Mapper
public interface AppUserMapper extends BaseMapper<AppUser> {
}
