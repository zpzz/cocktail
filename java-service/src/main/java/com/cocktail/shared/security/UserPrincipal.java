package com.cocktail.shared.security;

import java.util.Collection;
import java.util.List;

import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

/**
 * Spring Security 里的「当前用户」载体。
 * <p>
 * 只放 id / username；密码不放在这里（鉴权靠 JWT，不靠 UserDetails 密码比对）。
 */
public record UserPrincipal(Long id, String username) implements UserDetails {

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        // MVP 无角色体系，统一 ROLE_USER
        return List.of(new SimpleGrantedAuthority("ROLE_USER"));
    }

    @Override
    public String getPassword() {
        return "";
    }

    @Override
    public String getUsername() {
        return username;
    }

    @Override
    public boolean isAccountNonExpired() {
        return true;
    }

    @Override
    public boolean isAccountNonLocked() {
        return true;
    }

    @Override
    public boolean isCredentialsNonExpired() {
        return true;
    }

    @Override
    public boolean isEnabled() {
        return true;
    }
}
