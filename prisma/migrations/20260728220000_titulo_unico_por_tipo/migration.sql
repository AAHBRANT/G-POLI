-- v3: tipo entra na chave de unicidade do título (uma Norma e uma Política
-- podem ter o mesmo título na mesma área — só colide dentro do mesmo tipo).
DROP INDEX "Politica_titulo_areaId_key";
CREATE UNIQUE INDEX "Politica_titulo_areaId_tipo_key" ON "Politica"("titulo", "areaId", "tipo");
