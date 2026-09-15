-- Paleta categórica validada para o fundo escuro do painel:
-- passa banda de luminosidade, piso de croma, separação para daltonismo
-- (CVD ΔE 8.4), piso de visão normal (19.3) e contraste >= 3:1.
update public.categorias_custo set cor = '#3987e5' where nome = 'Links e Internet';
update public.categorias_custo set cor = '#d95926' where nome = 'Telefonia';
update public.categorias_custo set cor = '#199e70' where nome = 'Licencas de Software';
update public.categorias_custo set cor = '#c98500' where nome = 'Nuvem e Hospedagem';
update public.categorias_custo set cor = '#d55181' where nome = 'Hardware';
update public.categorias_custo set cor = '#008300' where nome = 'Manutencao e Suporte';
update public.categorias_custo set cor = '#9085e9' where nome = 'Seguranca';
update public.categorias_custo set cor = '#e66767' where nome = 'Outros';

-- acentos corretos agora que o seed já passou
update public.categorias_custo set nome = 'Licenças de Software' where nome = 'Licencas de Software';
update public.categorias_custo set nome = 'Manutenção e Suporte' where nome = 'Manutencao e Suporte';
update public.categorias_custo set nome = 'Segurança'            where nome = 'Seguranca';
;