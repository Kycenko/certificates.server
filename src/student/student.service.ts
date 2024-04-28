import { PrismaService } from '@config/prisma.service'
import { Injectable, NotFoundException } from '@nestjs/common'
import { formatISO } from 'date-fns'
import { fromZonedTime } from 'date-fns-tz'
import * as XLSX from 'xlsx'
import { StudentDto } from './dto/student.dto'
@Injectable()
export class StudentService {
	constructor(private prisma: PrismaService) {}

	async importStudents(file: Express.Multer.File) {
		const workbook = XLSX.read(file.buffer, {
			type: 'buffer',
			cellDates: true,
			cellNF: false,
			cellText: false
		})
		if (!file || !file.buffer) {
			throw new Error('Файл не был загружен или повреждён')
		}
		const sheetName = workbook.SheetNames[0]
		const worksheet = workbook.Sheets[sheetName]
		const data = XLSX.utils.sheet_to_json(worksheet) as Array<{
			name: string
			surname: string
			secondName: string
			birthDate: Date
		}>

		for (const item of data) {
			const utcDate = fromZonedTime(item.birthDate, 'Europe/Moscow')
			await this.prisma.student.create({
				data: {
					surname: item.surname,
					name: item.name,
					secondName: item.secondName || null,
					birthDate: formatISO(utcDate)
				}
			})
		}

		return { success: true, message: 'Студенты добавлены', data: data }
	}

	async create(dto: StudentDto) {
		return this.prisma.student.create({
			data: { ...dto, birthDate: formatISO(dto.birthDate) }
		})
	}

	async getAll(
		groupName?: string,
		sortOrder: 'asc' | 'desc' = 'asc',
		page: number = 1,
		pageSize: number = 50
	) {
		const whereCourse = groupName
			? {
					group: {
						name: groupName
					}
				}
			: {}

		const skip = (page - 1) * pageSize

		const students = await this.prisma.student.findMany({
			orderBy: {
				surname: sortOrder
			},
			where: whereCourse,
			include: {
				medicalCertificates: true,
				group: true
			},
			skip: skip,
			take: pageSize
		})

		if (!students || students.length === 0)
			throw new NotFoundException('Студенты не найдены!')
		return students
	}

	async getById(id: number) {
		const student = await this.prisma.student.findUnique({
			where: { id: +id },
			include: {
				medicalCertificates: {
					orderBy: {
						startDate: 'desc'
					},
					where: {
						studentId: +id
					}
				}
			}
		})
		if (!student) throw new NotFoundException('Студент не найден!')

		return student
	}

	async update(id: number, dto: StudentDto) {
		await this.getById(id)
		return this.prisma.student.update({
			where: { id: +id },
			data: {
				...dto,
				birthDate: formatISO(dto.birthDate)
			}
		})
	}

	async delete(id: number) {
		await this.getById(id)
		await this.prisma.student.delete({ where: { id: +id } })
	}
}
