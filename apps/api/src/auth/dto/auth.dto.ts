import { IsEmail, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'E-mail inválido' })
  email!: string;

  @IsString()
  @MinLength(1, { message: 'Senha obrigatória' })
  senha!: string;
}

export class RefreshDto {
  @IsString()
  refreshToken!: string;
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(1, { message: 'Senha atual obrigatória' })
  senhaAtual!: string;

  @IsString()
  @MinLength(8, { message: 'Nova senha deve ter ao menos 8 caracteres' })
  novaSenha!: string;

  @IsString()
  @MinLength(1, { message: 'Confirmação de senha obrigatória' })
  confirmacaoSenha!: string;
}

export class SwitchContextDto {
  @IsOptional()
  @IsString()
  roleId?: string;

  /** ID do órgão ou literal "all" para todos os órgãos (requer orgs:all). */
  @IsOptional()
  @ValidateIf((o) => o.orgaoId !== undefined)
  @IsString()
  orgaoId?: string | 'all';
}
