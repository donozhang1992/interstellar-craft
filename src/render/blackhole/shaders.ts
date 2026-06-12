/**
 * Schwarzschild geodesic raytracer GLSL — ported VERBATIM from
 * prototype/trailer.html (blackHoleMat). Do not "improve" (AGENT_RULES §5,
 * TECH_SPEC §7.5/§7.8). Comments kept from the trailer source.
 */

export const BH_VERTEX_SHADER = /* glsl */ `
    uniform vec3 uQuadPos, uQuadRight, uQuadUp;
    uniform float uQuadSize;
    varying vec2 vUv; varying vec3 vWorld;
    void main(){
      vUv = uv;
      // 离屏全屏 quad：uv 直接映射到 billboard 平面上的世界坐标
      vWorld = uQuadPos + (uv.x - .5) * uQuadSize * uQuadRight + (uv.y - .5) * uQuadSize * uQuadUp;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }`;

export const BH_FRAGMENT_SHADER = /* glsl */ `
    uniform float uTime, uWprs;
    uniform vec3 uCamPos, uBHPos, uBx, uBn, uBz;
    varying vec2 vUv; varying vec3 vWorld;

    const float RS = 1.0;
    const float DISK_IN = 2.3;
    const float DISK_OUT = 15.0;
    const float DISK_H = 0.26;  // 体积雾盘半厚度（高斯衰减）
    const int MAX_STEPS = 230;
    const float FAR_B = 17.0;   // 瞄准参数超过此值 → 解析弱场偏折，免积分

    float hash12(vec2 p){
      vec3 p3 = fract(vec3(p.xyx) * .1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }
    float hash13(vec3 p3){
      p3 = fract(p3 * .1031);
      p3 += dot(p3, p3.zyx + 31.32);
      return fract((p3.x + p3.y) * p3.z);
    }
    float noise(vec2 p){
      vec2 i = floor(p), f = fract(p);
      f = f*f*(3.-2.*f);
      return mix(mix(hash12(i), hash12(i+vec2(1,0)), f.x),
                 mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), f.x), f.y);
    }
    float fbm(vec2 p){
      float v = 0., a = .5;
      for(int i = 0; i < 5; i++){ v += a*noise(p); p = p*2.13 + vec2(7.3,1.7); a *= .55; }
      return v;
    }
    // 黑体配色：暗红 → 橙白 → 蓝白
    vec3 blackbody(float t){
      t = clamp(t, 0., 1.);
      vec3 c = vec3(smoothstep(0., .35, t), smoothstep(.12, .75, t)*.85, smoothstep(.35, 1., t));
      c.r += .25*smoothstep(0., .2, t)*(1.-t);
      return c;
    }
    // 透镜畸变后的程序化星空（按世界方向采样，与场景星空风格一致）
    vec3 starfield(vec3 dir){
      vec3 col = vec3(0.);
      for(int layer = 0; layer < 2; layer++){
        float scale = layer == 0 ? 220. : 90.;
        vec3 p = dir*scale;
        vec3 cell = floor(p);
        float h = hash13(cell);
        if(h > (layer == 0 ? .976 : .988)){
          vec3 center = cell + .5 + .4*(vec3(hash13(cell+7.1), hash13(cell+3.7), hash13(cell+1.3)) - .5);
          float d = length(p - center);
          float b = smoothstep(.5, 0., d)*(.4 + .6*hash13(cell+11.));
          vec3 sc = mix(vec3(1., .85, .7), vec3(.7, .85, 1.), hash13(cell+5.));
          col += b*b*sc*(layer == 0 ? 1.5 : 2.2);
        }
      }
      return col;
    }
    // 吸积盘辐射（开普勒流动 + 多普勒束射 + 引力红移）
    vec3 diskShade(vec3 pos, vec3 rayDir){
      float r = length(pos.xz);
      if(r < DISK_IN || r > DISK_OUT) return vec3(0.);
      float phi = atan(pos.z, pos.x);
      float omega = 1./pow(r, 1.5);
      float swirl = phi + 14.*omega - uTime*omega*1.2;
      float texR = (r - DISK_IN)/(DISK_OUT - DISK_IN);
      // 纤维状流丝：沿角向拉长、径向高频（电影里丝缕状的气流）
      float turb = fbm(vec2(swirl*2.2, r*5.5));
      turb = mix(turb, fbm(vec2(swirl*5.5, r*12.)), .42);
      turb = pow(turb, 1.25);
      float temp = pow(DISK_IN/r, .75);
      vec3 vel = vec3(-sin(phi), 0., cos(phi))*sqrt(.5*RS/r)*1.4;
      float dopp = 1./(1. - dot(vel, -rayDir));
      float beam = pow(clamp(dopp, .86, 1.28), 3.);  // 电影刻意削弱了多普勒不对称
      float gshift = sqrt(max(1. - RS/r, 0.));
      float emit = (.45 + 1.0*turb)*smoothstep(0., .08, texR)*smoothstep(1.05, .55, texR);
      vec3 col = blackbody(clamp(temp*1.05 + .25*(dopp - 1.), 0., 1.));
      // 电影色调：大幅去饱和 → 奶白主体，仅外缘残留一点尘埃暖色
      float dlum = dot(col, vec3(.299, .587, .114));
      col = mix(vec3(dlum), col, .38);
      col = mix(col, vec3(1.0, .975, .94), smoothstep(.35, .9, temp)*.75);
      return col*emit*beam*gshift*1.3;
    }
    // 零测地线积分：a = -1.5·rs·h²·pos/r⁵；吸积盘 = 体积雾层沿程积分
    vec4 trace(vec3 ro, vec3 rd){
      vec3 pos = ro, dir = rd, col = vec3(0.);
      vec3 hvec = cross(pos, dir);
      float h2 = dot(hvec, hvec);
      float escapeR = length(ro) + 20.0;
      bool captured = false;
      for(int i = 0; i < MAX_STEPS; i++){
        float r = length(pos);
        if(r < RS*1.02){ captured = true; break; }
        if(r > escapeR && dot(pos, dir) > 0.) break;
        float dt = clamp(r*.11, .04, 3.0);
        // 盘径向范围内：单步垂直位移不得超过半个雾层厚度，杜绝一步跨层漏采样
        float rxz = length(pos.xz);
        if(rxz < DISK_OUT + 3.5 && rxz > DISK_IN - 1.5){
          dt = min(dt, max(.1, .5*DISK_H/(abs(dir.y) + 1e-3)));
        }
        vec3 acc = -1.5*RS*h2*pos/pow(r, 5.);
        dir = normalize(dir + acc*dt);
        pos += dir*dt;
        // 体积雾盘发光（厚度让刀刃有质感、接缝被辉光填满）
        float r2 = length(pos.xz);
        if(abs(pos.y) < DISK_H*3. && r2 > DISK_IN && r2 < DISK_OUT){
          // 柔和雾层 + 中平面炽亮热核（参考剧照里刀刃中的高亮核线）
          float dens = exp(-pow(pos.y/DISK_H, 2.)) + 1.7*exp(-pow(pos.y/(DISK_H*.28), 2.));
          vec3 d = diskShade(vec3(pos.x, 0., pos.z), dir);
          col += d*dens*dt*.42*(1. - clamp(length(col), 0., 1.)*.55);
        }
      }
      if(!captured){
        // 透镜畸变后的背景星空（转回世界方向采样）；辉光处星光被对比度淹没
        vec3 wd = normalize(dir.x*uBx + dir.y*uBn + dir.z*uBz);
        col += starfield(wd)*(1. - clamp(length(col)*1.7, 0., 1.));
      }
      return vec4(col, captured ? 1. : 0.);
    }
    void main(){
      vec3 roW = uCamPos - uBHPos;
      vec3 rdW = normalize(vWorld - uCamPos);
      // 旋转进吸积盘局部系，长度换算成 rs
      vec3 ro = vec3(dot(roW, uBx), dot(roW, uBn), dot(roW, uBz))/uWprs;
      vec3 rd = normalize(vec3(dot(rdW, uBx), dot(rdW, uBn), dot(rdW, uBz)));
      // 瞄准参数：远离黑洞的光线用解析弱场偏折（α ≈ 2rs/b），免去逐步积分
      vec3 hv = cross(ro, rd);
      float b = length(hv);
      vec3 col;
      if(b > FAR_B){
        float alphaDef = 2.0*RS/b;
        vec3 axis = normalize(hv);
        vec3 bent = normalize(rd*cos(alphaDef) + cross(axis, rd)*sin(alphaDef));
        vec3 wd = normalize(bent.x*uBx + bent.y*uBn + bent.z*uBz);
        col = starfield(wd);
      } else {
        vec4 res = trace(ro, rd);
        col = res.rgb;
      }
      // 光子球辉光
      float impact = length(cross(normalize(-ro), rd))*length(ro);
      col += exp(-pow(max(impact - 2.6, 0.), 2.)*.4)*smoothstep(1.3, 2.5, impact)*.08*vec3(1., .93, .85);
      // 软压光（HDR 交给 Bloom + ACES）
      col = col/(1. + .5*col);
      // 预乘 alpha：渐隐只衰减对背景的遮挡，发光本身全亮度延伸到贴图边缘
      float q = length(vUv - .5)*2.;
      float alpha = smoothstep(1., .88, q);
      gl_FragColor = vec4(col*1.15, alpha);
    }`;
