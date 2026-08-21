#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""从《2026年8-12月马拉松赛事日历》合并基础数据（仅 A/B 类，待定日期跳过）"""
import json, re, datetime

SRC = 'data/races.json'
now = datetime.datetime.now().astimezone().isoformat(timespec='seconds')

# (月份, 日期, 省份, 赛事名称, 级别, 官网) —— 日期 None 表示"待定"
ROWS = [
    (8, '8.2', '云南', '楚雄马拉松', 'A', 'https://chuxiongmarathon.shuzixindong.com/'),
    (8, '8.9', '内蒙古', '阿尔山马拉松', 'C', None),
    (8, '8.9', '四川', '马尔康市半程马拉松', 'C', None),
    (8, '8.9', '河北', '康保草原马拉松', 'C', None),
    (8, '8.16', '新疆', '吉木萨尔天山马拉松', 'A', 'https://tianshan.shuzixindong.com/'),
    (8, '8.16', '湖北', '巴东野三关半程马拉松', 'B', 'http://www.badongmarathon.com/'),
    (8, '8.16', '云南', '鹤庆半程马拉松', 'B', 'https://heqing.sport-china.cn/'),
    (8, '8.16', '黑龙江', '鹤岗半程马拉松', 'C', None),
    (8, '8.23', '西藏', '拉萨半程马拉松', 'A', None),
    (8, '8.23', '辽宁', '沈阳康平卧龙湖半程马拉松', 'B', 'http://www.kangpingmarathon.luojiweiye.com/'),
    (8, '8.23', '贵州', '威宁半程马拉松', 'A', 'https://gw.iborun.cn/'),
    (8, '8.23', '内蒙古', '呼伦贝尔草原马拉松', 'C', None),
    (8, '8.23', '内蒙古', '敕勒川草原半程马拉松', 'C', None),
    (8, '8.23', '黑龙江', '富锦半程马拉松', 'C', None),
    (8, '8.30', '甘肃', '兰州新区马拉松', 'C', None),
    (8, '8.30', '宁夏', '沙坡头半程马拉松', 'B', None),
    (9, '9.5', '新疆', '可克达拉半程马拉松', 'B', None),
    (9, '9.6', '辽宁', '沈阳马拉松', 'A', 'http://www.symarathon.com/'),
    (9, '9.6', '内蒙古', '包头马拉松', 'C', None),
    (9, '9.6', '青海', '大美青海高原马拉松', 'C', None),
    (9, '9.6', '吉林', '长春莲花山半程马拉松', 'B', None),
    (9, '9.6', '辽宁', '铁岭莲花湿地半程马拉松', 'A', None),
    (9, '9.6', '甘肃', '金昌半程马拉松', 'A', 'http://www.jinchangmarathon.cn/'),
    (9, '9.6', '宁夏', '石嘴山环星海湖半程马拉松', 'C', None),
    (9, '9.13', '黑龙江', '哈尔滨马拉松', 'A', 'https://hrb-marathon.chinaath.com/#/'),
    (9, '9.13', '新疆', '乌鲁木齐马拉松', 'A', 'https://urumqimarathon.xempower.cn/'),
    (9, '9.13', '宁夏', '黄河金岸吴忠马拉松', 'A', 'http://nxhhjamarathon.spoorts.cn/'),
    (9, '9.13', '吉林', '查干湖半程马拉松', 'C', None),
    (9, '9.13', '辽宁', '大连长兴岛半程马拉松', 'C', None),
    (9, '9.13', '甘肃', '敦煌半程马拉松', 'C', None),
    (9, '9.13', '河北', '官厅湖马拉松', 'A', None),
    (9, '9.19', '内蒙古', '鄂尔多斯半程马拉松', 'C', None),
    (9, '9.19', '甘肃', '张掖黑河半程马拉松', 'C', None),
    (9, '9.26', '陕西', '榆林马拉松', 'A', 'https://yulin-marathon.com/'),
    (9, '9.26', '北京', '北京永定河半程马拉松', 'C', None),
    (9, '9.26', '新疆', '克拉玛依马拉松', 'A', 'https://klmymarathon.xempower.cn/'),
    (9, '9.26', '江西', '庐山半程马拉松', 'A', 'http://lushanmarathon.umaysports.cn/'),
    (9, '9.27', '山西', '太原马拉松', 'A', 'https://www.tymarathon.cn/'),
    (9, '9.27', '河北', '衡水湖马拉松', 'A', 'http://www.hengshuilakemarathon.com/'),
    (9, '9.27', '天津', '团泊湖半程马拉松', 'A', None),
    (9, '9.27', '北京', '怀柔长城马拉松', 'A', 'https://www.huairougreatwallmarathon.com/'),
    (9, '9.27', '云南', '大理小河淌水半程马拉松', 'A', None),
    (9, '9.27', '陕西', '延安红色半程马拉松', 'A', None),
    (9, '9.27', '北京', '房山良乡大学城半程马拉松', 'A', None),
    (9, '9.27', '四川', '长宁蜀南竹海半程马拉松', 'B', None),
    (9, '9.27', '山东', '广饶孙武湖半程马拉松', 'C', None),
    (9, '9.27', '甘肃', '红古民和半程马拉松', 'C', None),
    (9, None, '内蒙古', '呼和浩特马拉松', 'C', None),
    (9, None, '宁夏', '贺兰山东麓半程马拉松', 'B', None),
    (9, None, '新疆', '阿克苏马拉松', 'A', None),
    (9, None, '天津', '西青区半程马拉松', 'C', None),
    (10, '10.1', '天津', '潮白湿地半程马拉松', 'B', None),
    (10, '10.2', '新疆', '石河子马拉松', 'C', None),
    (10, '10.3', '云南', '玉溪马拉松', 'A', 'https://www.sichuanbojiesports.com/'),
    (10, '10.6', '天津', '武清半程马拉松', 'C', None),
    (10, '10.11', '北京', '海淀马拉松', 'A', 'http://haidian-marathon.com/'),
    (10, '10.11', '山东', '阳谷半程马拉松', 'C', None),
    (10, '10.17', '重庆', '两江摇滚半程马拉松', 'B', None),
    (10, '10.18', '北京', '北京马拉松', 'A', 'https://www.beijing-marathon.com/'),
    (10, '10.18', '陕西', '西安马拉松', 'A', 'https://xian.marathon.org.cn/'),
    (10, '10.18', '山东', '东营马拉松', 'A', 'https://www.hhkmls.com/'),
    (10, '10.18', '河南', '郑州马拉松', 'A', 'http://www.zhengzhou42195.com/'),
    (10, '10.18', '山东', '日照马拉松', 'B', None),
    (10, '10.18', '浙江', '杭州湘湖半程马拉松', 'A', 'http://www.xianghumarathon.com/'),
    (10, '10.18', '湖北', '随州马拉松', 'A', 'https://suizhou.sport-china.cn/'),
    (10, '10.18', '江苏', '兴化马拉松', 'C', None),
    (10, '10.18', '云南', '水富半程马拉松', 'A', None),
    (10, '10.18', '云南', '丽江雪山马拉松', 'C', None),
    (10, '10.18', '四川', '宜宾长江第一湾半程马拉松', 'C', None),
    (10, '10.18', '新疆', '铁门关半程马拉松', 'A', None),
    (10, '10.18', '山东', '龙口马拉松', 'A', None),
    (10, '10.18', '山西', '阳泉娘子关半程马拉松', 'A', None),
    (10, '10.25', '山东', '济南马拉松', 'A', 'http://jinanmarathon.iqilu.com/'),
    (10, '10.25', '四川', '成都马拉松', 'A', 'http://chengdumarathon.cn/'),
    (10, '10.25', '湖南', '长沙马拉松', 'A', 'https://www.marathonchangsha.com/'),
    (10, '10.25', '陕西', '宝鸡马拉松', 'A', 'https://www.baoji-marathon.com/'),
    (10, '10.25', '湖北', '襄阳马拉松', 'A', 'http://www.xiangyang-marathon.com/'),
    (10, '10.25', '江苏', '泰州马拉松', 'B', 'http://www.taizhoucitymarathon.com/'),
    (10, '10.25', '浙江', '杭州桐庐半程马拉松', 'A', None),
    (10, '10.25', '江苏', '泗洪马拉松', 'A', 'http://jssh.xempower.cn/'),
    (10, '10.25', '上海', '上海10公里精英赛', '', None),
    (10, '10.25', '山东', '威海半程马拉松', 'B', 'http://weihaimarathon.com/'),
    (10, '10.25', '江苏', '常熟尚湖半程马拉松', 'C', None),
    (10, '10.25', '山西', '临汾半程马拉松', 'A', None),
    (10, '10.25', '山东', '济宁太白湖半程马拉松', 'B', 'https://ipaohui.saihuitong.com'),
    (10, '10.25', '山东', '青岛胶州湾大桥马拉松', 'C', None),
    (10, '10.25', '云南', '普洱墨江半程马拉松', 'B', 'https://www.sichuanbojiesports.com/'),
    (10, '10.25', '北京', '昌平马拉松', 'A', None),
    (10, '10.25', '广西', '贺州半程马拉松', 'A', None),
    (10, '10.25', '重庆', '开州汉丰湖马拉松', 'B', None),
    (10, '10.25', '湖北', '环洪湖马拉松', 'C', None),
    (10, '10.25', '贵州', '贵阳清镇半程马拉松', 'C', None),
    (10, '10.25', '福建', '泰宁半程马拉松', 'B', None),
    (10, None, '天津', '天津马拉松', 'A', None),
    (10, None, '山西', '襄垣马拉松', 'C', None),
    (10, None, '浙江', '台州马拉松', 'B', None),
    (10, None, '河南', '汤河国家湿地公园半程马拉松', 'B', None),
    (10, None, '四川', '广安马拉松', 'A', None),
    (10, None, '四川', '遂宁观音湖马拉松', 'A', None),
    (10, None, '新疆', '库尔勒半程马拉松', 'A', None),
    (10, None, '新疆', '图木舒克马拉松', 'C', None),
    (11, '11.1', '浙江', '杭州马拉松', 'A', 'https://hm.zhetiyu.cn/home'),
    (11, '11.1', '山东', '烟台马拉松', 'A', 'https://m.irunner.mobi/mix-race-apply/index.html?match_eng=6a0519d3eab65#/grid'),
    (11, '11.1', '山东', '临沂马拉松', 'A', 'https://linyi.sport-china.cn/'),
    (11, '11.1', '湖北', '宜昌马拉松', 'A', 'http://www.yichangmarathon.com/'),
    (11, '11.1', '重庆', '长嘉汇半程马拉松', 'A', 'https://www.cqnbmarathon.com/'),
    (11, '11.1', '湖南', '衡阳马拉松', 'A', None),
    (11, '11.1', '江苏', '常州西太湖半程马拉松', 'A', 'http://www.czxthmls.com/'),
    (11, '11.1', '江西', '南昌赣江半程马拉松', 'A', 'https://nanchangganjiang.sport-china.cn/'),
    (11, '11.1', '湖北', '黄冈半程马拉松', 'A', 'http://huanggangmarathon.com/'),
    (11, '11.1', '安徽', '淮南马拉松', 'A', None),
    (11, '11.1', '山东', '聊城半程马拉松', 'A', None),
    (11, '11.1', '山东', '临朐半程马拉松', 'B', None),
    (11, '11.1', '江苏', '扬州高邮大运河半程马拉松', 'B', None),
    (11, '11.1', '安徽', '马鞍山采石矶半程马拉松', 'A', None),
    (11, '11.1', '四川', '德阳广汉三星堆半程马拉松', 'A', None),
    (11, '11.1', '北京', '朝阳区滨河半程马拉松', 'C', None),
    (11, '11.1', '陕西', '华阴半程马拉松', 'C', None),
    (11, '11.1', '重庆', '涪陵白鹤梁半程马拉松', 'A', None),
    (11, '11.1', '广西', '兴安灵渠半程马拉松', 'A', None),
    (11, '11.1', '湖南', '永州宁远九嶷山马拉松', 'A', None),
    (11, '11.1', '湖南', '大通湖半程马拉松', 'C', None),
    (11, '11.7', '四川', '西昌马拉松', 'A', None),
    (11, '11.8', '安徽', '合肥马拉松', 'A', 'https://www.hefeimarathon.com/'),
    (11, '11.8', '江苏', '无锡锡山宛山湖马拉松', 'A', 'http://www.xishanmls.com/'),
    (11, '11.8', '江苏', '南通马拉松', 'A', None),
    (11, '11.8', '江苏', '南京高淳马拉松', 'A', 'http://www.gaochunmarathon.com/'),
    (11, '11.8', '江西', '新余仙女湖马拉松', 'A', None),
    (11, '11.8', '广东', '顺德半程马拉松', 'A', 'http://shunde-marathon.com/'),
    (11, '11.8', '江苏', '连云港·连岛半程马拉松', 'B', None),
    (11, '11.8', '山东', '招远黄金马拉松', 'B', None),
    (11, '11.8', '四川', '乐山双遗马拉松', 'A', None),
    (11, '11.8', '湖南', '常德柳叶湖马拉松', 'A', None),
    (11, '11.8', '安徽', '滁州马拉松', 'A', None),
    (11, '11.8', '四川', '眉山东坡马拉松', 'A', None),
    (11, '11.8', '浙江', '杭州钱塘女子半程马拉松', 'A', None),
    (11, '11.8', '湖南', '郴州马拉松', 'A', 'https://chenzhou.sport-china.cn/'),
    (11, '11.8', '四川', '自贡市荣县大佛半程马拉松', 'A', None),
    (11, '11.8', '浙江', '开化钱江源马拉松', 'C', None),
    (11, '11.8', '广西', '崇左马拉松', 'A', None),
    (11, '11.8', '广西', '富川马拉松', 'B', 'https://fuchuan.sport-china.cn'),
    (11, '11.8', '山东', '莒县半程马拉松', 'C', None),
    (11, '11.8', '广西', '罗城半程马拉松', 'A', None),
    (11, '11.8', '湖南', '韶山半程马拉松', 'C', None),
    (11, '11.8', '重庆', '荣昌马拉松', 'C', None),
    (11, '11.8', '广东', '中山翠亨新区半程马拉松', 'C', None),
    (11, '11.15', '香港', '港珠澳大桥半程马拉松', '', 'https://hzmb-halfmarathon.com/zh_cn/'),
    (11, '11.15', '江西', '南昌马拉松', 'A', 'https://www.nanchangmarathon.cn/'),
    (11, '11.15', '湖北', '武汉光谷马拉松', 'A', 'https://guanggumarathon.mararun.com/'),
    (11, '11.15', '江苏', '天目湖马拉松', 'A', 'https://tmhmarathon.xempower.cn/'),
    (11, '11.15', '江苏', '苏州吴中太湖一号公路马拉松', 'C', None),
    (11, '11.15', '广西', '桂林马拉松', 'A', 'https://www.guilin-marathon.cn/'),
    (11, '11.15', '安徽', '池州马拉松', 'A', None),
    (11, '11.15', '浙江', '杭州建德马拉松', 'A', 'https://jiande.zjim.org/'),
    (11, '11.15', '浙江', '横店马拉松', 'A', None),
    (11, '11.15', '浙江', '诸暨西施半程马拉松', 'A', None),
    (11, '11.15', '浙江', '安吉半程马拉松', 'C', None),
    (11, '11.15', '重庆', '璧山马拉松', 'A', None),
    (11, '11.15', '浙江', '沪浙乡村半程马拉松', 'B', None),
    (11, '11.15', '上海', '长滩半程马拉松', 'B', None),
    (11, '11.22', '江苏', '南京马拉松', 'A', 'https://www.nj-marathon.cn/'),
    (11, '11.22', '浙江', '衢州马拉松', 'A', 'http://www.quzhoumarathon.cn/'),
    (11, '11.22', '云南', '腾冲马拉松', 'A', 'http://www.exprun.com/'),
    (11, '11.22', '浙江', '义乌半程马拉松', 'A', None),
    (11, '11.22', '湖北', '黄石马拉松', 'C', None),
    (11, '11.22', '广西', '防城港马拉松', 'A', None),
    (11, '11.22', '上海', '青浦新城半程马拉松', 'C', None),
    (11, '11.22', '江西', '宁都红色马拉松', 'B', None),
    (11, '11.22', '安徽', '六安马拉松', 'A', 'http://anhuijingti.saihuitong.com/'),
    (11, '11.22', '海南', '东方半程马拉松', 'A', 'https://dongfang.jinshensports.com'),
    (11, '11.22', '重庆', '潼南滨江田园半程马拉松', 'C', None),
    (11, '11.22', '福建', '永定土楼半程马拉松', 'A', None),
    (11, '11.22', '广东', '佛山市环两江稻田马拉松', 'B', None),
    (11, '11.22', '湖南', '江永半程马拉松', 'C', None),
    (11, '11.29', '浙江', '绍兴马拉松', 'A', 'http://www.sxym.org.cn/'),
    (11, '11.29', '浙江', '杭州千岛湖马拉松', 'A', 'https://qiandaohu.zjim.org/'),
    (11, '11.29', '江苏', '常州长荡湖马拉松', 'A', 'http://www.carmmarathon.cn/'),
    (11, '11.29', '安徽', '黄山马拉松', 'A', None),
    (11, '11.29', '广东', '惠州马拉松', 'A', 'http://huizhou-marathon.com/'),
    (11, '11.29', '福建', '仙游马拉松', 'A', None),
    (11, '11.29', '江西', '婺源马拉松', 'A', 'https://www.wymarathon.com/'),
    (11, '11.29', '广东', '阳江海陵岛马拉松', 'A', None),
    (11, '11.29', '上海', '奉贤海湾森林半程马拉松', 'B', None),
    (11, '11.29', '福建', '漳州半程马拉松', 'C', None),
    (11, '11.29', '海南', '陵水半程马拉松', 'C', None),
    (11, None, '浙江', '嘉兴马拉松', 'A', None),
    (11, None, '北京', '平谷桃花半程马拉松', 'A', None),
    (11, None, '浙江', '宁波象山半程马拉松', 'A', None),
    (11, None, '浙江', '舟山马拉松', 'A', None),
    (11, None, '安徽', '宿州马拉松', 'C', None),
    (11, None, '江西', '井冈山马拉松', 'A', None),
    (11, None, '山东', '环峡山湖马拉松', 'A', None),
    (11, None, '广东', '东莞松山湖马拉松', 'C', None),
    (11, None, '广东', '虎门半程马拉松', 'A', None),
    (11, None, '广东', '肇庆马拉松', 'A', None),
    (11, None, '广东', '揭阳马拉松', 'C', None),
    (11, None, '广西', '百色半程马拉松', 'C', None),
    (11, None, '四川', '南充嘉陵江马拉松', 'A', None),
    (11, None, '贵州', '铜仁梵净山马拉松', 'A', None),
    (11, None, '贵州', '黔东南香炉山马拉松', 'C', None),
    (11, None, '云南', '玉溪抚仙湖半程马拉松', 'A', None),
    (11, None, '陕西', '安康半程马拉松', 'C', None),
    (11, None, '新疆', '喀什马拉松', 'A', None),
    (12, '12.5', '浙江', '玉环半程马拉松', 'A', 'https://yuhuan.zjim.org/'),
    (12, '12.6', '上海', '上海马拉松', 'A', 'https://static.shang-ma.com/web/index.html'),
    (12, '12.6', '广东', '深圳马拉松', 'A', 'http://shenzhenmarathon.org.cn/'),
    (12, '12.6', '云南', '上合昆明马拉松', 'A', 'http://www.sco-marathon.com/'),
    (12, '12.6', '浙江', '温州马拉松', 'A', 'http://www.wzim.org/'),
    (12, '12.6', '江西', '赣州马拉松', 'A', None),
    (12, '12.6', '广东', '珠海马拉松', 'C', None),
    (12, '12.6', '福建', '厦门海沧半程马拉松', 'A', 'https://www.xmhaicangmarathon.com/'),
    (12, '12.6', '广东', '云浮新兴半程马拉松', 'A', None),
    (12, '12.6', '福建', '晋江马拉松', 'C', None),
    (12, '12.6', '海南', '澄迈半程马拉松', 'A', 'https://chengmai.jinshensports.com'),
    (12, '12.6', '重庆', '忠县马拉松', 'A', None),
    (12, '12.6', '山西', '汾阳市贾家庄半程马拉松', 'C', None),
    (12, '12.12', '海南', '琼海博鳌马拉松', 'A', None),
    (12, '12.12', '福建', '宁德马拉松', 'A', None),
    (12, '12.13', '福建', '武夷山马拉松', 'A', None),
    (12, '12.20', '广东', '广州马拉松', 'A', 'http://www.guangzhou-marathon.com/'),
    (12, '12.20', '广西', '南宁马拉松', 'A', 'https://www.nanning-marathon.com'),
    (12, '12.20', '广东', '深圳南山半程马拉松', 'A', 'https://www.szns-marathon.com/'),
    (12, '12.20', '福建', '厦门环东半程马拉松', 'A', 'http://xiamenhuandongmarathon.com/'),
    (12, '12.20', '海南', '儋州马拉松', 'A', 'https://danma.cn/'),
    (12, '12.20', '广东', '江门马拉松', 'A', 'https://jiangmen.sport-china.cn/'),
    (12, '12.20', '重庆', '重庆半程马拉松', 'A', None),
    (12, '12.20', '广西', '柳州半程马拉松', 'C', None),
    (12, '12.26', '湖南', '橘子洲红色半程马拉松', 'C', None),
    (12, '12.27', '福建', '福州马拉松', 'A', 'https://www.fuzhou-marathon.com/'),
    (12, '12.27', '海南', '海口马拉松', 'C', None),
    (12, '12.27', '海南', '三亚马拉松', 'A', 'https://sanya-marathon.irunner.mobi/'),
    (12, '12.27', '福建', '莆田马拉松', 'A', None),
    (12, '12.27', '广东', '横琴马拉松', 'A', 'http://www.hengqinmarathon.com/'),
    (12, '12.27', '广东', '河源万绿湖马拉松', 'A', None),
    (12, '12.27', '广东', '梅州马拉松', 'A', None),
    (12, '12.27', '四川', '雅安雨城半程马拉松', 'A', None),
    (12, '12.27', '福建', '漳州华安土楼半程马拉松', 'C', None),
    (12, '12.27', '内蒙古', '"中国冷极"半程马拉松', 'C', None),
    (12, None, '广东', '广州黄埔马拉松', 'A', None),
    (12, None, '广东', '丹霞山马拉松', 'C', None),
    (12, None, '广东', '汕头马拉松', 'A', None),
    (12, None, '广西', '玉林马拉松', 'A', None),
    (12, None, '四川', '攀枝花盐边半程马拉松', 'C', None),
]

races = json.load(open(SRC))
by_name = {r['name']: r for r in races}

def norm(s):
    return re.sub(r'[·""\s]', '', s)

# 宽松匹配：去掉"马拉松/半程"后缀比对，处理命名差异（如"顺德半程马拉松"vs已有记录）
def loose_key(s):
    s = norm(s)
    for suf in ['半程马拉松', '马拉松', '10公里精英赛']:
        if s.endswith(suf):
            s = s[:-len(suf)]
    return s

loose_index = {}
for r in races:
    loose_index.setdefault(loose_key(r['name']), []).append(r)

added, updated, skipped_level, skipped_tbd, conflicts = [], [], [], [], []

for month, day, prov, name, level, site in ROWS:
    if level not in ('A', 'B'):
        skipped_level.append(name)
        continue
    if day is None:
        skipped_tbd.append(f'{month}月 {name}')
        continue
    m, d = day.split('.')
    race_date = f'2026-{int(m):02d}-{int(d):02d}'
    events = ['半程马拉松'] if '半程' in name else ['全程马拉松']

    # 精确匹配优先，其次宽松匹配
    target = by_name.get(name)
    if target is None:
        cands = [r for r in loose_index.get(loose_key(name), []) if r['raceDate'][:7] == race_date[:7]]
        if len(cands) == 1:
            target = cands[0]
        elif len(cands) > 1:
            conflicts.append((name, [c['name'] for c in cands]))
            continue

    if target is None:
        rec = {
            'id': name, 'name': name, 'country': '中国', 'province': prov,
            'raceDate': race_date, 'regStatus': 'pending', 'events': events,
            'category': level, 'updatedAt': now,
        }
        if site:
            rec['officialSite'] = site
        races.append(rec)
        added.append(f'{race_date} {name}')
    else:
        changed = []
        if target['raceDate'] != race_date:
            changed.append(f"日期 {target['raceDate']} -> {race_date}")
            target['raceDate'] = race_date
        if site and not target.get('officialSite'):
            target['officialSite'] = site
            changed.append('补官网')
        if not target.get('province'):
            target['province'] = prov
        if changed:
            target['updatedAt'] = now
            updated.append(f"{target['name']}: {', '.join(changed)}")

json.dump(races, open(SRC, 'w'), ensure_ascii=False, indent=2)

print(f'=== 合并完成 ===')
print(f'总数: {len(races)}')
print(f'新增 {len(added)} 场:')
for a in added: print(' +', a)
print(f'\n更新 {len(updated)} 场:')
for u in updated: print(' *', u)
print(f'\n跳过: C类/未标注 {len(skipped_level)} 场, 日期待定 {len(skipped_tbd)} 场')
print('待定清单:', skipped_tbd)
if conflicts:
    print('\n⚠️ 匹配冲突(需人工确认):', conflicts)
