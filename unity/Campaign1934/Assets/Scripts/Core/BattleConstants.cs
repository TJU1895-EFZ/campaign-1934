namespace Campaign1934.Core
{
    public static class BattleConstants
    {
        public const int PlayerMaxHp = 100;
        public const int BotMaxHp = 100;
        public const int ShotDamage = 25;
        public const int CriticalHp = 25;
        public const int MagazineSize = 30;
        public const int TotalAmmo = 120;
        public const int ReserveAmmo = TotalAmmo - MagazineSize;
        public const float ReloadSeconds = 1.8f;
        public const float FireCooldownSeconds = 0.24f;
        public const bool FriendlyFireEnabled = false;
        public const int MaxTotalBots = 20;
        public const int MaxRedBots = 14;
        public const int MaxKmtBots = 8;
        public const int KeyAssaultCount = 6;
        public const float PlayerDownRespawnSeconds = 5f;
        public const float KmtReinforcementIntervalSeconds = 35f;
        public const int KmtTeamSize = 4;
        public const int KmtReinforcementTeams = 2;
        public const int KmtReinforcementTrigger = 4;
        public const float DirectorEmergencyCooldownSeconds = 3f;
        public const float FinalRetreatSeconds = 15f;
    }
}
