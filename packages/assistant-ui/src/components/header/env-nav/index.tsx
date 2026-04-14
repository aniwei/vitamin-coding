import { TerminalSquare } from '@/components/icons/solid/development'
import { Beaker02 } from '@/components/icons/solid/education'
import { useAppContext } from '@/context/app-context'
import { current } from 'immer'

const headerEnvClassName: { [k: string]: string } = {
  DEVELOPMENT: 'bg-[#FEC84B] border-[#FDB022] text-[#93370D]',
  TESTING: 'bg-[#A5F0FC] border-[#67E3F9] text-[#164C63]',
}

const EnvNav = () => {
  // const { versionInfo } = useAppContext()
  const context = {
    current_env: 'DEVELOPMENT',
  }
  const showEnvTag = context.current_env === 'TESTING' || context.current_env === 'DEVELOPMENT'

  if (!showEnvTag)
    return null

  return (
    <div className={`
      mr-1 flex h-[22px] items-center rounded-md border px-2 text-xs font-medium
      ${headerEnvClassName[context.current_env]}
    `}
    >
      {
        context.current_env === 'TESTING' && (
          <>
            <Beaker02 className="h-3 w-3" />
            <div className="ml-1 max-[1280px]:hidden">Testing</div>
          </>
        )
      }
      {
        context.current_env === 'DEVELOPMENT' && (
          <>
            <TerminalSquare className="h-3 w-3" />
            <div className="ml-1 max-[1280px]:hidden">Development</div>
          </>
        )
      }
    </div>
  )
}

export default EnvNav
