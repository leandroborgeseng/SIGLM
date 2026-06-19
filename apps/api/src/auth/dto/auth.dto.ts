import { IsEmail, IsString, MinLength } from 'class-validator';

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
